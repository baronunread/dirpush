/**
 * The agents' browser: a dedicated, real Google Chrome profile (data/browser-profile) with remote debugging on
 * a local port. Any agent that can run shell commands drives it with agent-browser (`scripts/ab` attaches to it);
 * the CLI starts it and handles secrets, so passwords never pass through a model.
 *
 * Google services other than sign-in are unreachable from this profile: a PAC script sends them to a dead proxy.
 * That holds for every client attached over CDP, not only for one wrapper.
 */
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { HOME } from "./db";

export const BROWSER_PORT = Number(process.env.LAUNCH_BROWSER_PORT ?? 9222);
export const PROFILE = join(HOME, "data/browser-profile");
const CHROME = process.env.LAUNCH_CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = `http://127.0.0.1:${BROWSER_PORT}`;
/** One agent-browser session for secret handling, attached to the same Chrome. */
const SECRETS_SESSION = "dirpush-secrets";

/** Same list as scripts/ab: the profile is signed into the human's Google account; only sign-in pages may load. */
export const BLOCKED_HOSTS = [
  "mail.google.com", "gmail.com", "www.gmail.com", "inbox.google.com",
  "drive.google.com", "drive.usercontent.google.com", "docs.google.com", "sheets.google.com", "slides.google.com", "forms.google.com",
  "photos.google.com", "keep.google.com", "calendar.google.com", "contacts.google.com",
  "myaccount.google.com", "security.google.com", "myactivity.google.com", "passwords.google.com",
  "pay.google.com", "payments.google.com", "wallet.google.com", "takeout.google.com", "admin.google.com",
  "script.google.com", "console.cloud.google.com", "cloud.google.com", "console.developers.google.com",
  "chromewebstore.google.com", "chrome.google.com",
];

export function pacScript(hosts = BLOCKED_HOSTS) {
  return `function FindProxyForURL(url, host) { var b = ${JSON.stringify(hosts)}; for (var i = 0; i < b.length; i++) if (host === b[i]) return "PROXY 127.0.0.1:9"; return "DIRECT"; }`;
}

type Target = { id: string; type: string; url: string; title: string; webSocketDebuggerUrl?: string };
const json = async <T>(path: string) => (await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(1500) })).json() as Promise<T>;

export async function browserStatus() {
  try {
    const v = await json<{ Browser: string }>("/json/version");
    const pages = (await json<Target[]>("/json/list")).filter((t) => t.type === "page");
    return { running: true, port: BROWSER_PORT, browserUrl: BASE, chrome: v.Browser, pages: pages.map((p) => ({ title: p.title.slice(0, 80), url: p.url.slice(0, 200) })) };
  } catch {
    return { running: false, port: BROWSER_PORT, browserUrl: BASE };
  }
}

export async function startBrowser() {
  const now = await browserStatus();
  if (now.running) return { ...now, started: false };
  if (!existsSync(CHROME)) throw new Error(`Google Chrome not found at ${CHROME} (set LAUNCH_CHROME)`);
  const pac = `data:application/x-ns-proxy-autoconfig;base64,${Buffer.from(pacScript()).toString("base64")}`;
  // Plain Chrome, headed, no automation flags: Google sign-in and bot checks see a normal browser. The keychain
  // flags match agent-browser and scripts/google-login: the profile's cookies are encrypted with that key, so
  // without them every saved session would be unreadable.
  Bun.spawn([CHROME, `--user-data-dir=${PROFILE}`, `--remote-debugging-port=${BROWSER_PORT}`, `--proxy-pac-url=${pac}`, "--use-mock-keychain", "--password-store=basic", "--no-first-run", "--no-default-browser-check"], {
    stdout: "ignore", stderr: "ignore", stdin: "ignore",
  }).unref();
  for (let i = 0; i < 40; i++) {
    await Bun.sleep(250);
    const s = await browserStatus();
    if (s.running) return { ...s, started: true };
  }
  throw new Error(`Chrome did not open port ${BROWSER_PORT}. Is this profile already open without remote debugging? Quit that window and retry.`);
}

export async function stopBrowser() {
  const s = await browserStatus();
  if (!s.running) return { stopped: false, running: false };
  const { webSocketDebuggerUrl } = await json<{ webSocketDebuggerUrl: string }>("/json/version");
  await new Promise<void>((resolve) => {
    const ws = new WebSocket(webSocketDebuggerUrl);
    ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: "Browser.close" }));
    ws.onclose = ws.onerror = () => resolve();
    setTimeout(resolve, 3000);
  });
  return { stopped: true };
}

function ab(args: string[], stdin?: string) {
  const p = Bun.spawnSync(["agent-browser", "--session", SECRETS_SESSION, "--cdp", String(BROWSER_PORT), ...args], { stdin: stdin === undefined ? "ignore" : Buffer.from(stdin), stdout: "pipe", stderr: "pipe", timeout: 60_000 });
  const out = p.stdout.toString().trim();
  if (p.exitCode !== 0) throw new Error(`agent-browser ${args[0]} failed: ${(p.stderr.toString() || out).trim().slice(0, 300)}`);
  return out;
}

/** The open tab on `site`'s host (the one the agent is working in); the most recently active one if several. */
async function pageOn(site: string) {
  const host = new URL(site.includes("://") ? site : `https://${site}`).hostname.replace(/^www\./, "");
  if (!(await browserStatus()).running) throw new Error("the browser is not running: launch browser start");
  const page = (await json<Target[]>("/json/list")).find((t) => t.type === "page" && /^https?:/.test(t.url) && new URL(t.url).hostname.replace(/^www\./, "").endsWith(host));
  if (!page) throw new Error(`no open tab on ${host}; open the login/sign-up page first`);
  ab(["tab", page.id]);
  return page;
}

/** Fills a saved login (agent-browser vault) into the open tab on that site. The password never leaves the vault. */
export async function vaultLogin(name: string) {
  const meta = JSON.parse(ab(["auth", "show", name, "--json"])) as { data?: { profile?: { url?: string } } };
  const url = meta.data?.profile?.url;
  if (!url) throw new Error(`vault entry ${name} has no login URL`);
  const page = await pageOn(url);
  ab(["auth", "login", name]);
  return { vault: name, page: page.url.slice(0, 200), filled: true };
}

/**
 * New account password: generated here, typed into every given field of the open tab on `url`'s site, checked,
 * then saved to the vault as `name`. Returns no secret.
 */
export async function newPassword(name: string, url: string, username: string, selectors: string[]) {
  if (!selectors.length) throw new Error("pass the password field selector(s), e.g. 'input[type=password]'");
  const page = await pageOn(url);
  const pw = randomBytes(18).toString("base64");
  for (const s of selectors) ab(["fill", s, pw]);
  // A fill can "succeed" on a selector that matched nothing; never save a password the site didn't get.
  const lengths = JSON.parse(ab(["eval", `JSON.stringify(${JSON.stringify(selectors)}.map((s) => document.querySelector(s)?.value.length ?? -1))`]));
  const got = (typeof lengths === "string" ? JSON.parse(lengths) : lengths) as number[];
  if (got.some((n) => n !== pw.length)) throw new Error(`password fields not filled (lengths ${got.join(", ")}); nothing saved`);
  ab(["auth", "save", name, "--url", url, "--username", username, "--password-stdin"], pw);
  return { vault: name, username, fields: selectors.length, page: page.url.slice(0, 200), saved: true };
}
