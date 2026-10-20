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

const WHAT: Record<string, string> = {
  captcha: "Tick the CAPTCHA, then do whatever the note above asks.",
  bot_protection: "Wait for the “checking your browser” page to pass, or tick its box if it shows one.",
};

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
    console.log(`\n${bold("Done for now.")}`);
    if (handedBack.length) console.log(`${green("✓")} Ready for the agents to finish: ${handedBack.join(", ")}`);
    if (byYou.length) console.log(`${green("✓")} Submitted by you: ${byYou.join(", ")}`);
    if (skipped.length) console.log(`${dim("·")} Skipped, still waiting: ${skipped.join(", ")}`);
    if (handedBack.length) await startAgent(handedBack.length);
  };

  const googleSignIn = async () => {
    const busy = db.select().from(jobs).where(and(eq(jobs.status, "running"), gt(jobs.leaseExpiresAt, Date.now()))).all();
    if (busy.length) {
      console.log(yellow(`An agent is using the browser right now (${busy.map((j) => j.subject).join(", ")}). Signing in closes that window.`));
      if ((await key(`${cyan("[enter]")} close it and sign in   ${cyan("[n]")} not now `, "\rn")) === "n") return false;
    }
    console.log(`A normal Chrome window opens on Google's sign-in page (the agents' own profile, nothing automated).`);
    console.log(`Sign in, then ${bold("quit that window with ⌘Q")} to come back here.`);
    script("google-login"); // returns when that Chrome quits
    const ok = (await key(`Signed in?  ${cyan("[y]")} yes   ${cyan("[n]")} no `, "yn")) === "y";
    if (ok) signedIn = true;
    else console.log(dim("No problem: run `dirpush checks` again whenever you want to retry."));
    return ok;
  };

  console.log(`${bold("dirpush checks")}  ${dim(`${google.length} need Google sign-in · ${queue.length} CAPTCHAs or bot checks`)}`);
  if (!google.length && !queue.length) return console.log("Nothing is waiting on you.");
  console.log(dim("Agents never solve these. You clear each one, then an agent finishes the submission (at the end I can start yours)."));

  if (google.length) {
    console.log(`\n${bold("1. Sign into Google")}  ${dim(google.map((j) => j.subject).join(", "))}`);
    console.log("These directories use “Sign in with Google”. Sign in once and the agents can use it from then on.");
    const k = await key(`${cyan("[enter]")} sign in now   ${cyan("[n]")} later   ${cyan("[q]")} quit `, "\rnq");
    if (k === "q") return await summary();
    if (k === "\r" && (await googleSignIn())) {
      for (const j of google) { J.unblock(db, j.id, "human signed into Google in the agents' Chrome profile"); handedBack.push(j.subject); }
    } else skipped.push(...google.map((j) => j.subject));
  }

  for (const [i, job] of queue.entries()) {
    const dir = await loadDirectory(job.subject).then((d) => d.directory).catch(() => null);
    const url = job.blockMessage?.match(/https?:\/\/[^\s)'"”]+/)?.[0]?.replace(/[.,;:]$/, "") ?? dir?.submission_url ?? dir?.website;
    const open = () => {
      if (!url) return console.log(yellow("No page saved for this one; open the directory yourself."));
      if (script("ab", "open", url) === 0) script("show-browser");
      else console.log(yellow(`Couldn't open the agents' Chrome. Open it yourself: ${url}`));
    };
    console.log(`\n${bold(`${google.length ? i + 2 : i + 1}. ${dir?.name ?? job.subject}`)}  ${dim(`${i + 1} of ${queue.length}`)}`);
    if (job.blockMessage) console.log(dim(job.blockMessage));
    if (url) console.log(`${dim("Page:")} ${url}`);
    console.log(WHAT[job.blockType ?? ""] ?? "Do what the note above asks.");
    console.log(dim("Asked to sign in with Google? Press g: Google refuses sign-in in the agents' window."));
    console.log(dim("No box on the page? It may have passed already, or it only shows on the form's last step: press enter and an agent tries again."));
    console.log(dim("Check never passes there? Submit it from your own browser instead, then press s."));
    open();
    for (;;) {
      const k = await key(`${cyan("enter")} cleared, agent finishes it  ${cyan("s")} I submitted it  ${cyan("o")} reopen  ${cyan("g")} Google sign-in  ${cyan("n")} skip  ${cyan("q")} quit › `, "\rsognq");
      if (k === "o") { open(); continue; }
      if (k === "g") { if (!signedIn) await googleSignIn(); open(); continue; }
      if (k === "q") return await summary();
      if (k === "n") skipped.push(job.subject);
      else if (k === "\r") {
        J.unblock(db, job.id, "human cleared the check in the agents' Chrome; continue in the same browser session");
        handedBack.push(job.subject);
      } else {
        const link = await ask(`Listing URL, if there is one ${dim("(enter to skip)")}: `);
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
    console.log(`\nNext: open your agent and say ${bold(`“${prompt}”`)}; it finishes the ${n} job(s) above.`);
    return;
  }
  console.log(`\nThe ${n} job(s) above are waiting for an agent to finish them.`);
  const k = await key(`${cyan("[enter]")} open ${agent.name} on “${prompt}” now   ${cyan("[n]")} I'll do it later `, "\rn");
  if (k === "n") return console.log(dim(`Whenever you're ready: open your agent and say “${prompt}”.`));
  // A new Terminal window, so the human watches it work and approves what it asks for. Nothing runs unattended.
  const cmd = `cd ${JSON.stringify(process.cwd())} && ${agent.bin} ${JSON.stringify(prompt)}`;
  const ok = Bun.spawnSync(["osascript", "-e", `tell application "Terminal" to do script ${JSON.stringify(cmd)}`, "-e", `tell application "Terminal" to activate`], { stdin: "ignore", stdout: "ignore", stderr: "ignore" }).exitCode === 0;
  console.log(ok ? `${green("✓")} Opened ${agent.name} in a new Terminal window.` : `Couldn't open Terminal. Run this yourself: ${cmd}`);
}
