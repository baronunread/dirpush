/**
 * `dirpush handoff` in a terminal: the human walks the hand-off queue themselves (src/handoff.ts), for anyone who
 * prefers that to their agent walking them through it in chat. Same queue, same effect on the jobs.
 */
import { createInterface } from "node:readline/promises";
import type { Db } from "./db";
import * as J from "./jobs";
import { loadCapabilities } from "./capabilities";
import { handoffDone, handoffQueue, handoffSkip, openHandoff, script } from "./handoff";

const color = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code: string) => (s: string) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = paint("1"), dim = paint("2"), green = paint("32"), yellow = paint("33"), cyan = paint("36");

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

export async function walk(db: Db, product?: string) {
  if (!process.stdin.isTTY) throw new Error("this is the interactive version: run 'dirpush handoff' in a terminal, or let your agent use 'handoff next'");
  const items = await handoffQueue(db, product, { includeSkipped: true });
  if (!items.length) return console.log("Nothing is waiting on you.");
  console.log(`${bold("dirpush handoff")} ${dim(`· ${items.length} to clear · an agent finishes each one after you`)}`);
  const host = (u: string) => u.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
  const keys = (pairs: [string, string][]) => `      ${pairs.map(([k, l]) => `${cyan(k)} ${l}`).join("   ")}  `;
  let back = 0, mine = 0, skipped = 0;

  for (const [i, h] of items.entries()) {
    const where = h.kind === "google_login" ? `${h.jobs.length} ${h.jobs.length === 1 ? "directory" : "directories"}` : h.url ? host(h.url) : "";
    console.log(`\n${dim(`${i + 1}/${items.length}`)}  ${bold(h.name)}  ${dim(where)}\n      ${h.todo}`);
    if (h.kind === "google_login") {
      const k = await key(keys([["enter", "sign in"], ["n", "later"], ["q", "quit"]]), "\rnq");
      if (k === "q") break;
      if (k === "n") { skipped++; continue; }
      console.log(dim("      Waiting for you to quit that Chrome window…"));
      script("google-login"); // returns when that Chrome quits
      if ((await key(`      Signed in?  ${cyan("y")} yes   ${cyan("n")} no  `, "yn")) === "y") { back += handoffDone(db, "google").handedBack.length; } else skipped++;
      continue;
    }
    if (!openHandoff(h) && h.url) console.log(yellow(`      Couldn't open it; go to ${h.url}`));
    const byHand = h.kind === "own_browser";
    const k = await key(keys(byHand ? [["s", "done"], ["n", "skip"], ["q", "quit"]] : [["enter", "done"], ["s", "I submitted it myself"], ["n", "skip"], ["q", "quit"]]), byHand ? "snq" : "\rsnq");
    if (k === "q") break;
    const id = h.jobs[0]!;
    if (k === "n") { handoffSkip(db, id); skipped++; }
    else if (k === "\r") { handoffDone(db, id); back++; }
    else { const link = await ask(`      Listing link ${dim("(enter to skip)")}: `); J.recordManual(db, id, "pending", link || undefined); mine++; }
  }
  const parts = [back && `${back} back to the agents`, mine && `${mine} done by you`, skipped && `${skipped} skipped`].filter(Boolean);
  console.log(`\n${green("✓")} ${bold("Done.")} ${parts.join(" · ") || "Nothing changed."}`);
  if (back) await startAgent(back);
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
