import { expect, test } from "bun:test";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "launch-"));
const env = { ...process.env, LAUNCH_DB: join(dir, "t.db"), LAUNCH_REGISTRY: join(dir, "reg"), LAUNCH_WORKSPACE: join(dir, "ws"), LAUNCH_WORKER: "test", LAUNCH_QUIET: "1" };
const directoryFixture = {
  id: "example-dir", name: "Example Dir", website: "https://example-dir.com", submission_url: "https://example-dir.com/submit",
  cost: { classification: "VERIFIED_FREE" }, audience: ["saas"],
  authentication: { required: false, signup_allowed: true },
  submission: { url_first: false }, autofetch: { supported: false },
  media: { logo: true, screenshots: { supported: false } },
  verification: { status: "verified", checked_at: "2026-09-27" },
};
const launch = (...args: string[]) => launchEnv({}, ...args);
const launchEnv = (extra: Record<string, string>, ...args: string[]) => {
  const p = Bun.spawnSync(["bun", join(import.meta.dir, "cli.ts"), ...args], { env: { ...env, ...extra } });
  if (p.exitCode) throw new Error(p.stderr.toString());
  return JSON.parse(p.stdout.toString());
};

test("registry list reads verified directories", async () => {
  await Bun.write(join(dir, "reg/example-dir/directory.yaml"), Bun.YAML.stringify({ ...directoryFixture, verification: { ...directoryFixture.verification, by: "test" } }));
  expect(launch("registry", "list", "--free", "--full")[0].verification.by).toBe("test");
  expect(launch("registry", "list", "--free")[0]).toMatchObject({ id: "example-dir", cost: "VERIFIED_FREE", signIn: "none" }); // compact row
});

test("multiple products: ambiguity is an error, submissions are per product", async () => {
  launch("init", "alpha");
  expect(launch("product", "show").name).toBe("Example"); // only one product: implicit
  launch("init", "beta");
  expect(() => launch("product", "show")).toThrow(/several products/);
  expect(launchEnv({ LAUNCH_PRODUCT: "beta" }, "product", "show").id).toBe("beta");
  expect(launch("products", "list").map((p: { id: string }) => p.id)).toEqual(["alpha", "beta"]);

  // example-dir comes from the first test
  const [a] = launch("submissions", "enqueue", "example-dir", "--product", "alpha");
  const [b] = launch("submissions", "enqueue", "example-dir", "--product", "beta");
  expect(a.id).not.toBe(b.id);
  expect(launch("directories", "recommend", "--unsubmitted", "--product", "alpha")).toEqual([]);
  expect(launch("submissions", "list", "--product", "beta").map((j: { id: string }) => j.id)).toEqual([b.id]);
  expect(() => launch("init", "Bad Name")).toThrow(/usage/);

  // Audience fit: an AI-only directory is hidden for a non-AI product unless --all.
  const ai = { ...JSON.parse(JSON.stringify(directoryFixture)), id: "ai-only", audience: ["ai-tools"] };
  Bun.spawnSync(["mkdir", "-p", join(dir, "reg/ai-only")]);
  await Bun.write(join(dir, "reg/ai-only/directory.yaml"), Bun.YAML.stringify(ai));
  const ids = (extra: string[]) => launch("directories", "recommend", "--product", "beta", ...extra).map((d: { id: string }) => d.id);
  expect(ids([])).not.toContain("ai-only");
  expect(ids(["--all"])).toContain("ai-only");

  // add_backlink: never (template default) hides and refuses conditional-free directories.
  const cond = { ...directoryFixture, id: "badge-only", cost: { classification: "CONDITIONAL_FREE" } };
  Bun.spawnSync(["mkdir", "-p", join(dir, "reg/badge-only")]);
  await Bun.write(join(dir, "reg/badge-only/directory.yaml"), Bun.YAML.stringify(cond));
  expect(ids([])).not.toContain("badge-only");
  expect(() => launch("submissions", "enqueue", "badge-only", "--product", "beta")).toThrow(/add_backlink: never/);
});

test("gallery proposal parks the job; approval releases it and wakes `wait`; todos", async () => {
  const [job] = launch("submissions", "list", "--product", "alpha");
  launch("work", "claim", job.id);
  await Bun.write(join(dir, "ws/products/alpha/assets/screenshots/home.png"), "png");
  const items = JSON.stringify([{ id: "home", path: "assets/screenshots/home.png", description: "Home" }]);
  const g = launch("gallery", "propose", "--product", "alpha", "--job", job.id, "--input", items);
  expect(launch("work", "show", job.id).job.blockType).toBe("gallery_approval");

  // `wait` stays pending while blocked, then returns once the human decides.
  expect(launch("wait", job.id, "--timeout", "0").resolved).toBe(false);
  const waiting = Bun.spawn(["bun", join(import.meta.dir, "cli.ts"), "wait", job.id], { env, stdout: "pipe" });
  launch("gallery", "approve", String(g.revision));
  const woke = JSON.parse(await new Response(waiting.stdout).text());
  expect(woke.resolved).toBe(true);
  expect(woke.job.status).toBe("queued");

  const t = launch("todo", "add", "--job", job.id, "--message", "Verify email at example-dir", "--url", "https://example-dir.com/verify");
  expect(t.productId).toBe("alpha");
  expect(launch("actions").todos.map((x: { id: number }) => x.id)).toEqual([t.id]);
  launch("todo", "done", String(t.id));
  expect(launch("actions").todos).toEqual([]);
});

test("oauth check: only identity scopes on accounts.google.com pass", () => {
  const ok = (u: string) => launch("oauth", "check", u).ok;
  expect(ok("https://accounts.google.com/o/oauth2/v2/auth?client_id=x&scope=openid%20email%20profile")).toBe(true);
  expect(ok("https://accounts.google.com/v3/signin/identifier?continue=https%3A%2F%2Faccounts.google.com%2Fo%2Foauth2%2Fv2%2Fauth%3Fscope%3Demail%2520profile")).toBe(true);
  expect(ok("https://accounts.google.com/gsi/select?client_id=x")).toBe(true);
  expect(() => launch("oauth", "check", "https://accounts.google.com/o/oauth2/v2/auth?scope=email+https://www.googleapis.com/auth/drive")).toThrow(/more than identity/);
  expect(() => launch("oauth", "check", "https://accounts.google.com/o/oauth2/v2/auth?client_id=x")).toThrow(/no scope/);
  expect(() => launch("oauth", "check", "https://accounts.google.com.evil.com/o/oauth2/v2/auth?scope=email")).toThrow(/not a Google/);
});

test("oauth consent: only Google's exact identity lines pass", () => {
  const consent = (text: string, ...extra: string[]) => {
    const p = Bun.spawnSync(["bun", join(import.meta.dir, "cli.ts"), "oauth", "consent", ...extra], { env, stdin: new TextEncoder().encode(text) });
    return p.exitCode === 0;
  };
  expect(consent("L'app x richiede\n\tVisualizzare l'indirizzo email principale del tuo Account Google\t\n\tAssociarti alle tue informazioni personali su Google.\t\nConsenti")).toBe(true);
  expect(consent("x\n\tSee your primary Google Account email address\n\tSee your personal info, including any personal info you've made publicly available\n")).toBe(true);
  expect(consent("x\n\tSee your primary Google Account email address\n\tSee and download your contacts' email addresses\n")).toBe(false);
  expect(consent("x\n\tVisualizzare, modificare ed eliminare tutti i tuoi file di Google Drive\n")).toBe(false);
  expect(consent("no list here")).toBe(false);
  const page = (items: string) => `Accedi a x.com\nGoogle consentirà a\nx.com di accedere a queste informazioni su di te\n${items}\nLeggi le norme sulla privacy e i Termini di servizio di x.com\nContinua`;
  expect(consent(page("Jane Founder\nNome e immagine del profilo\njane@example.com\nIndirizzo email"))).toBe(true);
  expect(consent(page("Jane Founder\nNome e immagine del profilo\nContatti\nVisualizzare i tuoi contatti"))).toBe(false);
  expect(consent(page(""))).toBe(false);
  // Re-sign-in page (no list): passes only on an identity-only first URL.
  const resignin = "Stai eseguendo nuovamente l'accesso a x\nLeggi le norme sulla privacy di x";
  const auth = "https://accounts.google.com/o/oauth2/v2/auth?scope=";
  expect(consent(resignin)).toBe(false);
  expect(consent(resignin, "--url", `${auth}openid+email+profile`)).toBe(true);
  expect(consent(resignin, "--url", `${auth}email+https://www.googleapis.com/auth/drive`)).toBe(false);
  expect(consent(resignin, "--url", "https://evil.example/o/oauth2/v2/auth?scope=email")).toBe(false);
});

test("launch boards need --all", async () => {
  const board = { ...directoryFixture, id: "board", kind: "launch_board" };
  Bun.spawnSync(["mkdir", "-p", join(dir, "reg/board")]);
  await Bun.write(join(dir, "reg/board/directory.yaml"), Bun.YAML.stringify(board));
  const ids = (extra: string[]) => launch("directories", "recommend", "--product", "beta", ...extra).map((d: { id: string }) => d.id);
  expect(ids([])).not.toContain("board");
  expect(ids(["--all"])).toContain("board");

});

test("specialized catalogs are filterable and excluded from ordinary listing recommendations", async () => {
  for (const kind of ["mcp_registry", "github_list", "plugin_marketplace", "api_catalog", "llms_directory"]) {
    const id = `catalog-${kind.replaceAll("_", "-")}`;
    Bun.spawnSync(["mkdir", "-p", join(dir, "reg", id)]);
    await Bun.write(join(dir, "reg", id, "directory.yaml"), Bun.YAML.stringify({ ...directoryFixture, id, kind }));
    expect(launch("registry", "list", "--kind", kind).map((d: { id: string }) => d.id)).toEqual([id]);
    const recommendations = (extra: string[]) => launch("directories", "recommend", "--product", "beta", ...extra).map((d: { id: string }) => d.id);
    expect(recommendations([])).not.toContain(id);
    expect(recommendations(["--all", "--kind", kind])).toEqual([id]);
  }
});

test("confirm directories can't be submitted until the human presses Approve", async () => {
  Bun.spawnSync(["mkdir", "-p", join(dir, "reg/product-hunt")]);
  await Bun.write(join(dir, "reg/product-hunt/directory.yaml"), Bun.YAML.stringify({ ...directoryFixture, id: "product-hunt" }));
  const [j] = launch("submissions", "enqueue", "product-hunt", "--product", "alpha");
  launch("work", "claim", j.id);
  expect(() => launch("work", "begin-submit", j.id)).toThrow(/needs the human's approval/);
  launch("work", "block", j.id, "--type", "permission", "--message", "approve?");
  launch("work", "unblock", j.id, "--note", "sure"); // an answer is not an approval
  launch("work", "claim", j.id);
  expect(() => launch("work", "begin-submit", j.id)).toThrow(/needs the human's approval/);
  launch("work", "block", j.id, "--type", "permission", "--message", "approve?");
  const { openDb } = await import("./db");
  const { unblock } = await import("./jobs");
  unblock(openDb(env.LAUNCH_DB), j.id, "", Date.now(), true); // the dashboard's Approve
  launch("work", "claim", j.id);
  expect(launch("work", "begin-submit", j.id).step).toBe("submitting");
});

test("registry updates: reports added/changed, keeps newer local entries, --apply writes", async () => {
  launch("registry", "list"); // migrations run
  const reg = join(dir, "reg");
  const write = (id: string, checked_at: string, name = id) =>
    Bun.write(join(reg, id, "directory.yaml"), Bun.YAML.stringify({ ...directoryFixture, id, name, verification: { status: "verified", checked_at } }));
  await write("upd-same", "2026-10-01");
  await write("upd-changed", "2026-10-01");
  await write("upd-mine", "2026-10-20", "Fixed locally");
  const remote = {
    revision: "r1", generatedAt: "2026-11-01T00:00:00Z",
    directories: [
      ["upd-same", "2026-10-01", "upd-same"], ["upd-changed", "2026-11-01", "Renamed"], ["upd-mine", "2026-10-01", "upd-mine"], ["upd-new", "2026-11-01", "New"],
    ].map(([id, checked_at, name]) => ({ directory: { ...directoryFixture, id, name, verification: { status: "verified", checked_at, sources: [] } }, playbook: null })),
  };
  const file = join(dir, "registry.json");
  await Bun.write(file, JSON.stringify(remote));
  const dry = launch("registry", "updates", "--url", file);
  expect(dry).toMatchObject({ applied: false, added: ["upd-new"], changed: ["upd-changed"], localNewer: ["upd-mine"] });
  expect(existsSync(join(reg, "upd-new"))).toBe(false);
  launch("registry", "updates", "--url", file, "--apply");
  expect(launch("registry", "show", "upd-changed").directory.name).toBe("Renamed");
  expect(launch("registry", "show", "upd-mine").directory.name).toBe("Fixed locally");
  expect(launch("registry", "updates", "--url", file)).toMatchObject({ added: [], changed: [] });
});

test("submissions add records a listing made by hand, from a registry id or any URL", async () => {
  const byId = launch("submissions", "add", "example-dir", "--product", "alpha", "--listing-url", "https://example-dir.com/p/alpha");
  expect(byId).toMatchObject({ status: "done", outcome: "live", subject: "example-dir", inRegistry: true });
  expect(() => launch("submissions", "add", "https://www.example-dir.com/whatever", "--product", "beta")).toThrow(/several directories/);
  Bun.spawnSync(["mkdir", "-p", join(dir, "reg/solo-site")]);
  await Bun.write(join(dir, "reg/solo-site/directory.yaml"), Bun.YAML.stringify({ ...directoryFixture, id: "solo-site", website: "https://solo-site.dev" }));
  const bySite = launch("submissions", "add", "https://www.solo-site.dev/submit", "--product", "beta");
  expect(bySite).toMatchObject({ status: "done", outcome: "pending", subject: "solo-site" });
  const elsewhere = launch("submissions", "add", "https://news.ycombinator.com/item?id=1", "--product", "beta", "--outcome", "live");
  expect(elsewhere).toMatchObject({ subject: "news.ycombinator.com", outcome: "live", inRegistry: false });
  expect(() => launch("submissions", "add", "example-dir", "--product", "beta", "--outcome", "maybe")).toThrow(/outcome/);
});
