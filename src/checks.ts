/**
 * `dirpush checks`: the human's part of a launch, in the terminal. Google sign-in first, in plain Chrome with no
 * automation attached (Google refuses sign-in in a window software is driving); then each CAPTCHA or bot check,
 * opened in the agents' Chrome. Agents never solve these: this hands each job back once the human has.
 */
import { createInterface } from "node:readline/promises";
import { join } from "node:path";
import { and, eq, gt, inArray } from "drizzle-orm";
import { HOME, PKG, type Db } from "./db";
import { jobs } from "./db/schema";
import * as J from "./jobs";
import { loadCapabilities } from "./capabilities";
import { loadDirectory } from "./registry";

const color = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code: string) => (s: string) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = paint("1"), dim = paint("2"), green = paint("32"), yellow = paint("33"), cyan = paint("36");
const env = { ...process.env, LAUNCH_HOME: HOME };
const script = (name: string, ...args: string[]) =>
  Bun.spawnSync([join(PKG, "scripts", name), ...args], { env, stdin: "ignore", stdout: "ignore", stderr: "ignore" }).exitCode;

/** One keypress, no Enter needed. Enter comes back as "\r"; Ctrl-C quits. */
async function key(prompt: string, keys: string): Promise<string> {
  process.stdout.write(prompt);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  try {
    for (;;) {
      const k = await new Promise<string>((r) => process.stdin.once("data", (b: Buffer) => r(b.toString())));
      if (k === "\x03") { process.stdout.write("\n"); process.exit(130); }
      const ch = k === "\r" || k === "\n" ? "\r" : k.toLowerCase();
      if (keys.includes(ch)) { process.stdout.write(ch === "\r" ? "\n" : `${ch}\n`); return ch; }
    }
  } finally {
    process.stdin.setRawMode(false);
    process.stdin.pause();
  }
}

async function ask(prompt: string) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try { return (await rl.question(prompt)).trim(); } finally { rl.close(); }
}

export async function checks(db: Db, opts: { product?: string; types: string[] }) {
  if (!process.stdin.isTTY) throw new Error("checks is interactive: run `dirpush checks` yourself in a terminal");
  const blocked = (types: string[]) => db.select().from(jobs)
    .where(and(eq(jobs.kind, "submission"), eq(jobs.status, "blocked"), inArray(jobs.blockType, types))).all()
    .filter((j) => !opts.product || j.productId === opts.product);
  const google = blocked(["google_login"]);
  const queue = blocked(opts.types);
  const handedBack: string[] = [], byYou: string[] = [], skipped: string[] = [];
  let signedIn = false;

  const summary = async () => {
    const parts = [handedBack.length && `${handedBack.length} back to the agents`, byYou.length && `${byYou.length} done by you`, skipped.length && `${skipped.length} skipped`].filter(Boolean);
    console.log(`\n${green("✓")} ${bold("Done.")} ${parts.join(" · ") || "Nothing changed."}`);
    if (handedBack.length) await startAgent(handedBack.length);
  };

  const googleSignIn = async () => {
    const busy = db.select().from(jobs).where(and(eq(jobs.status, "running"), gt(jobs.leaseExpiresAt, Date.now()))).all();
    if (busy.length) {
      console.log(yellow(`      An agent is using the browser (${busy.map((j) => j.subject).join(", ")}); signing in closes it.`));
      if ((await key(`      ${cyan("enter")} sign in anyway   ${cyan("n")} not now  `, "\rn")) === "n") return false;
    }
    console.log(dim("      Waiting for you to quit that Chrome window…"));
    script("google-login"); // returns when that Chrome quits
    const ok = (await key(`      Signed in?  ${cyan("y")} yes   ${cyan("n")} no  `, "yn")) === "y";
    if (ok) signedIn = true;
    return ok;
  };

  const total = queue.length + (google.length ? 1 : 0);
  if (!total) return console.log("Nothing is waiting on you.");
  console.log(`${bold("dirpush checks")} ${dim(`· ${total} to clear · an agent finishes each one after you`)}`);
  const host = (u: string) => u.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
  const item = (n: number, name: string, where: string, todo: string) =>
    console.log(`\n${dim(`${n}/${total}`)}  ${bold(name)}  ${dim(where)}\n      ${todo}`);
  const keys = (pairs: [string, string][]) => `      ${pairs.map(([k, l]) => `${cyan(k)} ${l}`).join("   ")}  `;

  if (google.length) {
    item(1, "Google sign-in", google.length === 1 ? "1 directory" : `${google.length} directories`, "A Chrome window opens: sign in, then quit it with ⌘Q.");
    const k = await key(keys([["enter", "sign in"], ["n", "later"], ["q", "quit"]]), "\rnq");
    if (k === "q") return await summary();
    if (k === "\r" && (await googleSignIn())) {
      for (const j of google) { J.unblock(db, j.id, "human signed into Google in the agents' Chrome profile"); handedBack.push(j.subject); }
    } else skipped.push(...google.map((j) => j.subject));
  }

  for (const [i, job] of queue.entries()) {
    const dir = await loadDirectory(job.subject).then((d) => d.directory).catch(() => null);
    const url = job.blockMessage?.match(/https?:\/\/[^\s)'"”]+/)?.[0]?.replace(/[.,;:]$/, "") ?? dir?.submission_url ?? dir?.website;
    // Sites that break under automation: the human does them in their own browser (the agent's note says what to do).
    const yours = /your own browser/i.test(job.blockMessage ?? "");
    const open = () => {
      if (!url) return;
      if (yours) Bun.spawnSync(["open", url]);
      else if (script("ab", "open", url) === 0) script("show-browser");
      else console.log(yellow(`      Couldn't open the agents' Chrome; open ${url} yourself.`));
    };
    const todo = yours
      ? `Do this one in your own browser: ${(job.blockMessage ?? "").split(/your own browser:?/i)[1]?.trim().replace(/,? then press s in dirpush checks\.?$/i, "") ?? "submit rdyrct"}.`
      : "Tick the box in the window that opened. No box? Just press enter.";
    item(i + 1 + (google.length ? 1 : 0), dir?.name ?? job.subject, url ? host(url) : "", todo);
    open();
    for (;;) {
      const k = await key(keys(yours ? [["s", "done"], ["n", "skip"], ["q", "quit"]] : [["enter", "done"], ["s", "I submitted it myself"], ["n", "skip"], ["q", "quit"]]), yours ? "sognq" : "\rsognq");
      if (k === "o") { open(); continue; }
      if (k === "g") { if (!signedIn) await googleSignIn(); open(); continue; }
      if (k === "q") return await summary();
      if (k === "n") skipped.push(job.subject);
      else if (k === "\r") {
        J.unblock(db, job.id, "human cleared the check in the agents' Chrome; continue in the same browser session");
        handedBack.push(job.subject);
      } else {
        const link = await ask(`      Listing link ${dim("(enter to skip)")}: `);
        J.recordManual(db, job.id, "pending", link || undefined);
        byYou.push(job.subject);
      }
      break;
    }
  }
  await summary();
}


/** The agent CLIs we can open on "continue my launch", most likely first: the one that recorded capabilities, then any on PATH. */
async function startAgent(n: number) {
  const caps = await loadCapabilities().catch(() => null);
  const known = [
    { id: "claude-code", name: "Claude Code", bin: "claude" },
    { id: "codex", name: "Codex", bin: "codex" },
  ].filter((a) => Bun.which(a.bin));
  const agent = known.find((a) => caps?.checked_by?.startsWith(a.id)) ?? known[0];
  const prompt = "continue my launch";
  if (!agent || process.platform !== "darwin") {
    console.log(`Next: tell your agent ${bold(`“${prompt}”`)} to finish them.`);
    return;
  }
  const k = await key(`  ${cyan("enter")} open ${agent.name} to finish them   ${cyan("n")} later  `, "\rn");
  if (k === "n") return console.log(dim(`  Later: tell your agent “${prompt}”.`));
  // A new Terminal window, so the human watches it work and approves what it asks for. Nothing runs unattended.
  const cmd = `cd ${JSON.stringify(process.cwd())} && ${agent.bin} ${JSON.stringify(prompt)}`;
  const ok = Bun.spawnSync(["osascript", "-e", `tell application "Terminal" to do script ${JSON.stringify(cmd)}`, "-e", `tell application "Terminal" to activate`], { stdin: "ignore", stdout: "ignore", stderr: "ignore" }).exitCode === 0;
  console.log(ok ? `${green("✓")} Opened ${agent.name} in a new Terminal window.` : `Couldn't open Terminal. Run this yourself: ${cmd}`);
}
