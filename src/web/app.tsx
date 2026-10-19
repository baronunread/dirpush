import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { DIRECTORY_KINDS } from "../directory-kinds";

// ---- types ------------------------------------------------------------------

type Job = {
  id: string; kind: string; subject: string; productId: string; status: string; step: string; worker: string | null;
  attempts: number; blockType: string | null; blockMessage: string | null; lastError: string | null;
  outcome: string | null; listingUrl: string | null; updatedAt: number; data: Record<string, unknown>;
};
type Event = { id: number; jobId: string | null; type: string; worker: string | null; data: Record<string, any>; at: number };
type Todo = { id: number; productId: string; jobId: string | null; message: string; url: string | null; createdAt: number };
type ProductApproval = { id: number; productId: string; action: string; message: string; createdAt: number };
type Gallery = { revision: number; productId: string; status: string; items: { path: string; description: string }[]; createdAt: number };
type Change = { id: number; directoryId: string; observation: Record<string, any>; createdAt: number };
type Actions = { blocked: Job[]; unknown: Job[]; failed: Job[]; todos: Todo[]; galleries: Gallery[]; productApprovals: ProductApproval[]; registryChanges: Change[] };
type Dir = {
  id: string; name: string; website: string; submission_url: string | null;
  cost: { classification: string; notes?: string }; audience: string[];
  authentication: { required: boolean; methods?: string[] };
  submission: { conditions: string[]; fields?: { name: string; required: boolean; limit?: number }[] };
  verification: { checked_at: string; sources?: string[] };
  kind?: keyof typeof DIRECTORY_KINDS; human_only?: string | null; review_time?: string;
};
type Product = { id: string; name?: string; url?: string; tagline?: string; error?: string; [k: string]: any };
type Ratings = { products: Record<string, { measuredAt: number; rating: number }[]>; directories: Record<string, number | null> };
type Meta = { registrySource: string; ahrefs: boolean };
type Updates = { source: string; checkedAt: number; applied: boolean; added: string[]; changed: string[]; localNewer: string[]; onlyLocal: string[]; generatedAt: string };

const VIEWS = { overview: "Overview", needs: "Needs you", submissions: "Submissions", directories: "Directories", product: "Product" } as const;
type View = keyof typeof VIEWS;

// ---- plumbing ---------------------------------------------------------------

/** Polls `path`; any action fires "refresh" so every view reloads at once. */
function useApi<T>(path: string | null, every = 5000): T | undefined {
  const [data, setData] = useState<T>();
  useEffect(() => {
    if (!path) return;
    const load = () => fetch(path).then((r) => r.json() as Promise<T>).then(setData, () => {});
    load();
    const t = setInterval(load, every);
    addEventListener("refresh", load);
    return () => (clearInterval(t), removeEventListener("refresh", load));
  }, [path]);
  return data;
}

async function post<T = unknown>(path: string, body?: object): Promise<T & { error?: string }> {
  const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
  const j = (await r.json().catch(() => ({}))) as T & { error?: string };
  dispatchEvent(new Event("refresh"));
  return j;
}
const act = async (path: string, body?: object) => {
  const j = await post(path, body);
  if (j.error) alert(j.error);
  return !j.error;
};
const unblock = (job: Job, note: string, approve = false) => act(`/api/jobs/${job.id}/unblock`, { note, ...(approve && { approve: "yes" }) });

const ago = (ms: number) => {
  const s = Math.round((Date.now() - ms) / 1000);
  return s < 60 ? "just now" : s < 3600 ? `${Math.round(s / 60)}m ago` : s < 86400 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago`;
};
const When = ({ at }: { at: number }) => <time dateTime={new Date(at).toISOString()} title={new Date(at).toLocaleString("en-US")}>{ago(at)}</time>;
const day = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const words = (s: string) => s.replaceAll("_", " ").toLowerCase();
const host = (url: string) => url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
const Ext = ({ href, children }: { href: string; children?: ReactNode }) => <a href={href} target="_blank" rel="noreferrer">{children ?? host(href)}</a>;
const Linkify = ({ text }: { text: string }) => (
  <>{text.split(/(https?:\/\/[^\s)]+)/).map((part, i) => (i % 2 ? <a key={i} href={part} target="_blank" rel="noreferrer">{host(part)}</a> : part))}</>
);
const Loading = () => <p className="quiet">Loading…</p>;
const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} },
};
const parseHash = () => {
  const [view, arg = ""] = decodeURIComponent(location.hash.slice(1)).split("/");
  return { view: (view && view in VIEWS ? view : "overview") as View, arg };
};

// ---- vocabulary ---------------------------------------------------------------

type Tone = "green" | "yellow" | "red" | "blue" | "gray";
type State = "live" | "review" | "badge" | "needs" | "hold" | "queued" | "running" | "checking" | "failed" | "rejected";
const STATE: Record<State, [string, Tone]> = {
  live: ["Live", "green"], review: ["In review", "blue"], badge: ["Needs badge", "gray"], needs: ["Needs you", "yellow"], hold: ["On hold", "gray"],
  queued: ["Queued", "gray"], running: ["Working", "blue"], checking: ["Verifying", "blue"], failed: ["Didn't work", "red"], rejected: ["Rejected", "red"],
};
function stateOf(j: Job): State {
  if (j.status === "blocked") return j.blockType === "hold" ? "hold" : "needs";
  if (j.status === "failed") return "failed";
  if (j.status === "unknown") return "checking";
  if (j.status === "running") return "running";
  if (j.status === "done") return j.outcome === "live" ? "live" : j.outcome === "rejected" ? "rejected" : j.outcome === "needs_badge" ? "badge" : "review";
  return "queued";
}
const Tag = ({ tone = "gray", children }: { tone?: Tone; children: ReactNode }) => <span className={`tag ${tone}`}>{children}</span>;
const StateTag = ({ job }: { job: Job }) => { const [label, tone] = STATE[stateOf(job)]; return <Tag tone={tone}>{label}</Tag>; };

const COST: Record<string, [string, Tone]> = {
  VERIFIED_FREE: ["Free", "green"], FREEMIUM: ["Freemium", "blue"], CONDITIONAL_FREE: ["Conditions", "yellow"], PAID: ["Paid", "red"],
};
const CostTag = ({ d }: { d: Dir }) => { const [label, tone] = COST[d.cost.classification] ?? [words(d.cost.classification), "gray" as Tone]; return <Tag tone={tone}>{label}</Tag>; };
const signIn = (d: Dir) => (d.authentication.required ? (d.authentication.methods?.length ? d.authentication.methods.join(", ") : "account") : "none");

/** Why a job ended where it did, in one line. */
const reasonOf = (j: Job) =>
  j.status === "blocked" ? (j.blockMessage ?? "") : j.status === "failed" ? (j.lastError ?? "").replace(/^(\w+): /, (_, r) => `${words(r)}: `) : j.status === "done" ? "" : j.step === "queued" ? "" : `Step: ${words(j.step)}`;

function describe(e: Event): string {
  const d = e.data;
  const type = e.type.replace(/^hosted\./, "");
  switch (type) {
    case "job_created": return "Queued";
    case "claimed": return "An agent picked it up";
    case "checkpoint": return `Step: ${words(String(d.step ?? ""))}`;
    case "blocked": return `Needed you: ${d.message ?? words(d.type ?? "")}`;
    case "needs_user": return `Needed you: ${d.detail ?? words(d.block_type ?? "")}`;
    case "unblocked": return `You answered${d.note ? `: ${d.note}` : ""}`;
    case "reply_to_target": return `You answered${d.decision ? `: ${d.decision}` : ""}`;
    case "failed": return `Didn't work: ${d.reason}`;
    case "failed_retryable": return `Will retry: ${d.reason}`;
    case "submit_attempted": case "begin_submit": return "Clicked submit";
    case "submission_recorded": return `Submitted (${words(String(d.outcome))})`;
    case "report": return `${STATE[(d.state === "pending" ? "review" : d.state) as State]?.[0] ?? words(String(d.state ?? "updated"))}${d.detail ? `: ${d.detail}` : ""}`;
    case "submission_state_unknown": return "Unclear whether it went through; will verify";
    case "verified_not_submitted": return "Verified it didn't go through";
    case "outcome_changed": return `Now ${words(String(d.to))}`;
    case "requeued": case "retry_target": return "Sent back to the queue";
    case "resume": return "Resumed";
    case "lease_expired": return "Agent went quiet; job freed";
    case "released": return "Agent handed it back";
    case "todo_added": return `To-do: ${d.message}`;
    case "hosted_import": return "Imported from dirpush.com";
    case "added_manually": return `You recorded it by hand${d.listingUrl ? `: ${d.listingUrl}` : ""}`;
    default: return words(type);
  }
}

// ---- app --------------------------------------------------------------------

function App() {
  const products = useApi<Product[]>("/api/products", 30000);
  const actions = useApi<Actions>("/api/actions");
  const [chosen, setChosen] = useState(() => store.get("product") ?? "");
  const product = products?.find((p) => p.id === chosen) ?? products?.[0];
  const [route, setRoute] = useState(parseHash);
  const [panel, setPanel] = useState<{ job?: string; dir?: string } | null>(null);
  useEffect(() => {
    const on = () => (setRoute(parseHash()), setPanel(null));
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  const pid = product?.id ?? "";
  const needs = actions ? needsCount(actions, pid) : 0;
  const open = { job: (id: string) => setPanel({ job: id }), dir: (id: string) => setPanel({ dir: id }) };

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">dirpush</div>
        {products && products.length > 1 && (
          <select className="switch" value={pid} onChange={(e) => (setChosen(e.target.value), store.set("product", e.target.value))} aria-label="Product">
            {products.map((p) => <option key={p.id} value={p.id}>{p.name ?? p.id}</option>)}
          </select>
        )}
        {products?.length === 1 && <div className="switch static">{product?.name ?? pid}</div>}
        <nav aria-label="Views">
          {(Object.keys(VIEWS) as View[]).map((v) => (
            <a key={v} href={`#${v}`} aria-current={route.view === v ? "page" : undefined}>
              {VIEWS[v]}
              {v === "needs" && needs > 0 && <span className="count">{needs}</span>}
            </a>
          ))}
        </nav>
        <p className="side-foot">Runs on this computer.<br />Agents use the <code>launch</code> CLI.</p>
      </aside>
      <main>
        {!products ? <Loading /> : !product ? <Empty /> : (
          <>
            {route.view === "overview" && <Overview product={product} actions={actions} open={open} />}
            {route.view === "needs" && (actions ? <NeedsYou d={actions} pid={pid} open={open} /> : <Loading />)}
            {route.view === "submissions" && <Submissions pid={pid} filter={route.arg} open={open} />}
            {route.view === "directories" && <Directories pid={pid} open={open} />}
            {route.view === "product" && <ProductView product={product} />}
          </>
        )}
      </main>
      {panel?.job && <JobPanel id={panel.job} close={() => setPanel(null)} openDir={open.dir} />}
      {panel?.dir && <DirectoryPanel id={panel.dir} pid={pid} close={() => setPanel(null)} openJob={open.job} />}
    </div>
  );
}

function Empty() {
  return (
    <section className="page">
      <h1>No product yet</h1>
      <p className="lede">Run <code>dirpush init &lt;product-id&gt;</code>, fill in <code>product.yaml</code>, then ask your agent to “continue my launch”.</p>
    </section>
  );
}

function Head({ title, children, aside }: { title: string; children?: ReactNode; aside?: ReactNode }) {
  return (
    <header className="head">
      <div>
        <h1>{title}</h1>
        {children && <p className="lede">{children}</p>}
      </div>
      {aside && <div className="head-aside">{aside}</div>}
    </header>
  );
}

// ---- overview ---------------------------------------------------------------

function Overview({ product, actions, open }: { product: Product; actions?: Actions; open: { job: (id: string) => void } }) {
  const jobs = useApi<Job[]>("/api/jobs?kind=submission");
  const ratings = useApi<Ratings>("/api/ratings", 60000);
  const meta = useApi<Meta>("/api/meta", 60000);
  const feed = useApi<{ activity: Event[] }>("/api/overview", 10000);
  if (!jobs) return <Loading />;
  const mine = jobs.filter((j) => j.productId === product.id);
  const n = (...s: State[]) => mine.filter((j) => s.includes(stateOf(j))).length;
  const submitted = n("live", "review", "badge", "rejected");
  const parts = [
    { label: "Live", n: n("live"), tone: "green", href: "#submissions/live" },
    { label: "In review", n: n("review", "badge"), tone: "blue", href: "#submissions/review" },
    { label: "Needs you", n: n("needs"), tone: "yellow", href: "#needs" },
    { label: "Queued", n: n("queued", "running", "checking"), tone: "gray", href: "#submissions/queued" },
    { label: "On hold", n: n("hold"), tone: "faint", href: "#submissions/hold" },
  ];
  const active = mine.length - n("failed", "rejected");
  const subject = new Map(jobs.map((j) => [j.id, j]));
  const needsTotal = actions ? needsCount(actions, product.id) : 0;
  const needsList = actions ? actions.blocked.filter((j) => j.productId === product.id && j.kind === "submission" && j.blockType !== "hold" && j.blockType !== "gallery_approval") : [];
  const activity = (feed?.activity ?? []).filter((e) => e.jobId && subject.get(e.jobId)?.productId === product.id && !["hosted_import", "job_created"].includes(e.type)).slice(0, 8);

  return (
    <section className="page">
      <Head title={product.name ?? product.id}>{product.url && <Ext href={product.url} />}{product.tagline && <> · {product.tagline}</>}</Head>

      <div className="stats">
        <Stat href="#submissions/live" n={n("live")} label="Live" tone="green" />
        <Stat href="#submissions/review" n={n("review", "badge")} label="In review" />
        <Stat href="#needs" n={needsTotal} label="Need you" tone={needsTotal ? "yellow" : undefined} />
        <Stat href="#submissions/queued" n={n("queued", "running", "checking")} label="Queued" />
      </div>

      <div className="grid-2 stretch">
        <section className="card">
          <h2>Progress</h2>
          <p className="big-line"><strong>{submitted}</strong> of {active} directories submitted</p>
          <div className="segments" aria-hidden="true">
            {parts.map((p) => p.n > 0 && <span key={p.label} className={p.tone} style={{ flexGrow: p.n }} />)}
          </div>
          <ul className="legend">
            {parts.map((p) => (
              <li key={p.label}>
                <a href={p.href}><span className={`dot ${p.tone}`} />{p.label}<span className="legend-n">{p.n}</span></a>
              </li>
            ))}
          </ul>
          <p className="quiet small">{n("failed", "rejected")} more didn't work: paid, badge walls or not a fit.</p>
        </section>
        <DomainRating history={ratings?.products[product.id]} meta={meta} tall />
      </div>

      <section className="block">
        <div className="block-head"><h2>Needs you</h2>{needsTotal > 0 && <a href="#needs">See all {needsTotal}</a>}</div>
        {needsList.length === 0 ? <p className="quiet">Nothing is waiting on you. Agents can keep going.</p> : (
          <ul className="list">
            {needsList.slice(0, 5).map((j) => (
              <li key={j.id}>
                <button className="row-button" onClick={() => open.job(j.id)}>
                  <span className="row-title">{j.subject}</span>
                  <span className="row-text">{j.blockMessage}</span>
                  <Tag tone="yellow">{GROUP_LABEL[groupOf(j)]}</Tag>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="block">
        <h2>Recent activity</h2>
        <ol className="feed">
          {activity.map((e) => (
            <li key={e.id}>
              <span className="quiet"><When at={e.at} /></span>
              {e.jobId ? <button className="link" onClick={() => open.job(e.jobId!)}>{subject.get(e.jobId)?.subject ?? e.jobId}</button> : <span />}
              <span className="clip" title={describe(e)}>{describe(e)}</span>
            </li>
          ))}
        </ol>
      </section>
    </section>
  );
}

function Stat({ href, n, label, tone }: { href: string; n: number; label: string; tone?: Tone }) {
  return (
    <a className="stat" href={href}>
      <span className={`stat-n ${tone ?? ""}`}>{n}</span>
      <span className="stat-label">{label}</span>
    </a>
  );
}

function DomainRating({ history, meta, tall }: { history?: { measuredAt: number; rating: number }[]; meta?: Meta; tall?: boolean }) {
  const [busy, setBusy] = useState(false);
  const readings = [...(history ?? [])].reverse(); // oldest first
  const latest = readings.at(-1), first = readings[0];
  const change = latest && first ? latest.rating - first.rating : 0;
  return (
    <section className="card">
      <div className="block-head">
        <h2>Domain Rating</h2>
        {meta?.ahrefs && <button className="ghost" disabled={busy} onClick={async () => { setBusy(true); const r = await post("/api/ratings/refresh"); setBusy(false); if (r.error) alert(r.error); }}>{busy ? "Measuring…" : "Measure now"}</button>}
      </div>
      <p className="big-line">
        <strong className="dr">{latest?.rating ?? "—"}</strong>
        {latest && <span className={change > 0 ? "up" : change < 0 ? "down" : "quiet"}>{change > 0 ? `+${change}` : change} since {day(first!.measuredAt)}</span>}
      </p>
      <DrChart readings={readings} height={tall ? 236 : 110} />
      <p className="quiet small">
        {!latest ? (meta?.ahrefs ? "No readings yet. Press Measure now." : <>Optional: set <code>AHREFS_API_KEY</code> to measure weekly.</>)
          : <>Ahrefs, {readings.length} reading{readings.length === 1 ? "" : "s"}. Dotted where there's no data. DR moves weeks after listings go live.</>}
      </p>
    </section>
  );
}

/** DR over time. Solid between readings a week or so apart; dotted across gaps and from the last reading to today. */
function DrChart({ readings, height }: { readings: { measuredAt: number; rating: number }[]; height: number }) {
  const W = 480, H = height, padL = 28, padR = 8, padT = 10, padB = 22;
  const now = Date.now(), DAY = 86400000, GAP = 9 * DAY;
  const start = readings[0]?.measuredAt ?? now - 30 * DAY;
  const end = Math.max(now, start + 7 * DAY);
  const values = readings.map((r) => r.rating);
  const lo = Math.max(0, Math.floor(Math.min(...values, 100) - 5)), hi = Math.min(100, Math.ceil(Math.max(...values, 0) + 5));
  const [y0, y1] = readings.length ? [lo, Math.max(hi, lo + 10)] : [0, 100];
  const x = (t: number) => padL + ((t - start) / (end - start)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - (v - y0) / (y1 - y0)) * (H - padT - padB);
  const segments: { a: [number, number]; b: [number, number]; dotted: boolean }[] = [];
  readings.forEach((r, i) => {
    const next = readings[i + 1];
    if (next) segments.push({ a: [r.measuredAt, r.rating], b: [next.measuredAt, next.rating], dotted: next.measuredAt - r.measuredAt > GAP });
  });
  if (latest(readings) && now - latest(readings)!.measuredAt > DAY) segments.push({ a: [latest(readings)!.measuredAt, latest(readings)!.rating], b: [end, latest(readings)!.rating], dotted: true });
  const ticks = [y0, Math.round((y0 + y1) / 2), y1];
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={readings.length ? `Domain Rating from ${readings[0]!.rating} to ${latest(readings)!.rating}` : "No Domain Rating readings yet"}>
      {ticks.map((v) => (
        <g key={v}>
          <line className="grid" x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} />
          <text className="axis" x={padL - 6} y={y(v) + 3} textAnchor="end">{v}</text>
        </g>
      ))}
      <text className="axis" x={padL} y={H - 4}>{day(start)}</text>
      <text className="axis" x={W - padR} y={H - 4} textAnchor="end">Today</text>
      {!readings.length && <line className="line dotted" x1={padL} x2={W - padR} y1={y((y0 + y1) / 2)} y2={y((y0 + y1) / 2)} />}
      {segments.map((s, i) => <line key={i} className={`line ${s.dotted ? "dotted" : ""}`} x1={x(s.a[0])} y1={y(s.a[1])} x2={x(s.b[0])} y2={y(s.b[1])} />)}
      {readings.map((r) => (
        <circle key={r.measuredAt} className="point" cx={x(r.measuredAt)} cy={y(r.rating)} r={3}><title>{`${r.rating} on ${day(r.measuredAt)}`}</title></circle>
      ))}
    </svg>
  );
}
const latest = <T,>(xs: T[]) => xs.at(-1);

// ---- needs you --------------------------------------------------------------

type Group = "answer" | "yourself" | "email" | "hold";
const GROUP_LABEL: Record<Group, string> = { answer: "Question", yourself: "Do it yourself", email: "Verify email", hold: "On hold" };
const YOURSELF = new Set(["captcha", "bot_protection", "human_verification", "manual", "google_login"]);
const groupOf = (j: Job): Group => (j.blockType === "hold" ? "hold" : j.blockType === "email_verification" ? "email" : YOURSELF.has(j.blockType ?? "") ? "yourself" : "answer");

function needsCount(d: Actions, pid: string) {
  const subs = d.blocked.filter((j) => j.productId === pid && j.kind === "submission" && j.blockType !== "hold" && j.blockType !== "gallery_approval");
  const mine = <T extends { productId: string }>(xs: T[]) => xs.filter((x) => !x.productId || x.productId === pid);
  return subs.length + mine(d.galleries).length + mine(d.productApprovals).length + mine(d.todos).length + d.registryChanges.length;
}

/** Only an explicit dashboard press may approve a final submission. */
const wantsApproval = (j: Job) => j.blockType === "permission" && ["ready", "submitting"].includes(j.step) &&
  /submit|send|final action/i.test(j.blockMessage ?? "") && /approve.{0,100}dashboard|dashboard.{0,100}approve/i.test(j.blockMessage ?? "");

function NeedsYou({ d, pid, open }: { d: Actions; pid: string; open: { job: (id: string) => void } }) {
  const dirs = useApi<Dir[]>("/api/registry", 60000);
  const submitUrl = new Map((dirs ?? []).map((x) => [x.id, x.submission_url ?? x.website]));
  const mine = <T extends { productId: string }>(xs: T[]) => xs.filter((x) => !x.productId || x.productId === pid);
  const blocked = d.blocked.filter((j) => j.productId === pid && j.kind === "submission" && j.blockType !== "gallery_approval");
  const by = (g: Group) => blocked.filter((j) => groupOf(j) === g);
  const approvals = mine(d.galleries).length + mine(d.productApprovals).length + d.registryChanges.length;
  const total = blocked.length - by("hold").length + approvals + mine(d.todos).length;
  const unknown = d.unknown.filter((j) => j.productId === pid);

  return (
    <section className="page">
      <Head title="Needs you">{total ? `${total} things only you can do. Agents pick each job back up the moment you act.` : "Nothing is waiting on you."}</Head>

      {approvals > 0 && (
        <Section title="Approvals" n={approvals}>
          {mine(d.galleries).map((g) => (
            <Item key={`g${g.revision}`} title="Screenshots" kind="Approve">
              <p>Agents will use these on directories that take screenshots.</p>
              <ul className="shots">{g.items.map((i) => <li key={i.path}><img src={`/workspace/products/${g.productId}/${i.path}`} alt={i.description} loading="lazy" /><span>{i.description}</span></li>)}</ul>
              <div className="actions">
                <button onClick={() => act(`/api/galleries/${g.revision}/approve`)}>Approve</button>
                <button className="ghost" onClick={() => act(`/api/galleries/${g.revision}/reject`)}>Reject</button>
              </div>
            </Item>
          ))}
          {mine(d.productApprovals).map((a) => (
            <Item key={`p${a.id}`} title={words(a.action)} kind="Approve">
              <p>{a.message}</p>
              <div className="actions">
                <button onClick={() => act(`/api/product-approvals/${a.id}/approve`)}>Approve</button>
                <button className="ghost" onClick={() => act(`/api/product-approvals/${a.id}/reject`)}>Reject</button>
              </div>
            </Item>
          ))}
          {d.registryChanges.map((c) => (
            <Item key={`r${c.id}`} title={c.directoryId} kind="Registry change">
              <p>An agent saw the live site differ from the registry.</p>
              <div className="actions">
                <button onClick={() => act(`/api/registry-changes/${c.id}/accept`)}>Accept</button>
                <button className="ghost" onClick={() => act(`/api/registry-changes/${c.id}/reject`)}>Reject</button>
              </div>
            </Item>
          ))}
        </Section>
      )}

      <Section title="Questions" n={by("answer").length} note="The agent needs a fact or a yes/no. Your answer goes straight to it.">
        {by("answer").map((j) => <QuestionItem key={j.id} job={j} open={open.job} />)}
      </Section>

      <Section title="Do it yourself" n={by("yourself").length} note="These sites block automated browsers. Open the page in your normal browser, submit, then mark it done.">
        {by("yourself").map((j) => (
          <Item key={j.id} title={j.subject} kind={words(j.blockType ?? "")} onTitle={() => open.job(j.id)} at={j.updatedAt}>
            <p><Linkify text={j.blockMessage ?? ""} /></p>
            <div className="actions">
              {j.blockType === "google_login"
                ? <button onClick={() => act("/api/google-login")}>Open Google sign-in</button>
                : submitUrl.get(j.subject) && <a className="button" href={submitUrl.get(j.subject)!} target="_blank" rel="noreferrer">Open submit page</a>}
              <button className="ghost" onClick={() => act(`/api/jobs/${j.id}/manual`, { outcome: "pending" })}>I submitted it</button>
              <button className="ghost" onClick={() => unblock(j, "skip")}>Skip</button>
            </div>
          </Item>
        ))}
      </Section>

      <Section title="Verify email" n={by("email").length} note="Click the link in the email the directory sent, then confirm here.">
        {by("email").map((j) => (
          <Item key={j.id} title={j.subject} kind="Email" onTitle={() => open.job(j.id)} at={j.updatedAt}>
            <p><Linkify text={j.blockMessage ?? ""} /></p>
            <div className="actions">
              <button onClick={() => unblock(j, "verified")}>Verified</button>
              <button className="ghost" onClick={() => unblock(j, "No email arrived: resend the verification email, then block again.")}>Didn't arrive</button>
              <button className="ghost" onClick={() => unblock(j, "skip")}>Skip</button>
            </div>
          </Item>
        ))}
      </Section>

      <Section title="To-dos" n={mine(d.todos).length} note="Things to check when you have a minute. They don't hold up any submission.">
        {mine(d.todos).map((t) => (
          <li key={`t${t.id}`} className="todo">
            <p>{t.message}</p>
            {t.url && <Ext href={t.url} />}
            <button className="ghost" onClick={() => act(`/api/todos/${t.id}/done`)}>Done</button>
          </li>
        ))}
      </Section>

      {unknown.length > 0 && (
        <Section title="Being verified" n={unknown.length} note="An agent stopped mid-submit. The next run checks for the listing before trying again. Nothing to do.">
          {unknown.map((j) => <Item key={j.id} title={j.subject} kind="Checking" onTitle={() => open.job(j.id)} at={j.updatedAt} />)}
        </Section>
      )}

      {by("hold").length > 0 && (
        <details className="fold">
          <summary>On hold <span className="quiet">{by("hold").length}</span><span className="quiet small"> · Parked on purpose, for example until a release.</span></summary>
          <ul className="items">
            {by("hold").map((j) => (
              <Item key={j.id} title={j.subject} kind="Hold" onTitle={() => open.job(j.id)} at={j.updatedAt}>
                <p><Linkify text={j.blockMessage ?? ""} /></p>
                <div className="actions">
                  <button className="ghost" onClick={() => unblock(j, "Resume now.")}>Resume</button>
                  <button className="ghost" onClick={() => unblock(j, "skip")}>Skip</button>
                </div>
              </Item>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function Section({ title, n, note, children }: { title: string; n: number; note?: string; children: ReactNode }) {
  if (!n) return null;
  return (
    <section className="block">
      <div className="block-head"><h2>{title} <span className="quiet">{n}</span></h2></div>
      {note && <p className="quiet small note">{note}</p>}
      <ul className="items">{children}</ul>
    </section>
  );
}

function Item({ title, kind, at, onTitle, children }: { title: string; kind: string; at?: number; onTitle?: () => void; children?: ReactNode }) {
  return (
    <li className="item">
      <div className="item-head">
        {onTitle ? <button className="link strong" onClick={onTitle}>{title}</button> : <strong>{title}</strong>}
        <span className="quiet small">{kind}{at && <> · <When at={at} /></>}</span>
      </div>
      {children}
    </li>
  );
}

function QuestionItem({ job, open }: { job: Job; open: (id: string) => void }) {
  const [note, setNote] = useState("");
  return (
    <Item title={job.subject} kind={words(job.blockType ?? "question")} onTitle={() => open(job.id)} at={job.updatedAt}>
      <p><Linkify text={job.blockMessage ?? ""} /></p>
      <form className="answer" onSubmit={(e) => (e.preventDefault(), unblock(job, note).then((ok) => ok && setNote("")))}>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Your answer" aria-label={`Answer for ${job.subject}`} />
        <button type="submit" disabled={!note.trim()}>Send</button>
        {wantsApproval(job) && <button type="button" onClick={() => unblock(job, "approved", true)}>Approve submission</button>}
        <button type="button" className="ghost" onClick={() => unblock(job, "skip")}>Skip</button>
      </form>
    </Item>
  );
}

// ---- the one table ----------------------------------------------------------

type Col<T> = { label: string; value: (r: T) => string | number | null | undefined; render?: (r: T) => ReactNode; className?: string };
type Chip<T> = { id: string; label: string; test: (r: T) => boolean };

function Table<T>({ rows, cols, rowKey, onRow, chips, initialChip = "", sort: initialSort = [0, 1], label, empty = "Nothing here.", tools }: {
  rows: T[]; cols: Col<T>[]; rowKey: (r: T) => string; onRow?: (r: T) => void; chips?: Chip<T>[]; initialChip?: string;
  sort?: [number, 1 | -1]; label: string; empty?: string; tools?: ReactNode;
}) {
  const [q, setQ] = useState("");
  const [chip, setChip] = useState(chips?.some((c) => c.id === initialChip) ? initialChip : "");
  const [[by, dir], setSort] = useState(initialSort);
  const [all, setAll] = useState(false);
  const shown = useMemo(() => {
    const test = chips?.find((c) => c.id === chip)?.test;
    const needle = q.trim().toLowerCase();
    const key = (r: T) => cols[by]!.value(r) ?? "";
    return rows
      .filter((r) => (!test || test(r)) && (!needle || cols.some((c) => String(c.value(r) ?? "").toLowerCase().includes(needle))))
      .sort((a, b) => {
        const x = key(a), y = key(b);
        return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * dir;
      });
  }, [rows, q, chip, by, dir]);
  const cap = all ? shown.length : 150;

  return (
    <div className="table">
      <div className="toolbar">
        <input type="search" placeholder={`Search ${label}`} value={q} onChange={(e) => setQ(e.target.value)} aria-label={`Search ${label}`} />
        {tools}
        <span className="quiet small count-label">{shown.length === rows.length ? rows.length : `${shown.length} of ${rows.length}`}</span>
      </div>
      {chips && (
        <div className="chips" role="group" aria-label={`Filter ${label}`}>
          {[{ id: "", label: "All", test: () => true } as Chip<T>, ...chips].map((c) => (
            <button key={c.id} className="chip" aria-pressed={chip === c.id} onClick={() => setChip(c.id)}>
              {c.label}<span>{rows.filter(c.test).length}</span>
            </button>
          ))}
        </div>
      )}
      {shown.length === 0 ? <p className="quiet pad">{rows.length ? "No matches." : empty}</p> : (
        <div className="scroll">
          <table>
            <thead>
              <tr>
                {cols.map((c, i) => (
                  <th key={c.label} className={c.className} aria-sort={by === i ? (dir > 0 ? "ascending" : "descending") : undefined}>
                    <button className="sort" onClick={() => setSort([i, by === i ? (-dir as 1 | -1) : 1])}>
                      {c.label}<span aria-hidden="true">{by === i ? (dir > 0 ? " ↑" : " ↓") : ""}</span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.slice(0, cap).map((r) => (
                <tr key={rowKey(r)} className={onRow ? "clickable" : undefined} tabIndex={onRow ? 0 : undefined}
                  onClick={(e) => onRow && !(e.target as Element).closest("a,button,input") && onRow(r)}
                  onKeyDown={(e) => onRow && e.key === "Enter" && e.target === e.currentTarget && onRow(r)}>
                  {cols.map((c) => <td key={c.label} className={c.className}>{c.render ? c.render(r) : (c.value(r) ?? "—")}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length > cap && <button className="ghost more" onClick={() => setAll(true)}>Show all {shown.length}</button>}
        </div>
      )}
    </div>
  );
}

// ---- submissions ------------------------------------------------------------

const SUB_CHIPS: Chip<Job>[] = [
  { id: "live", label: "Live", test: (j) => stateOf(j) === "live" },
  { id: "review", label: "In review", test: (j) => ["review", "badge"].includes(stateOf(j)) },
  { id: "needs", label: "Needs you", test: (j) => stateOf(j) === "needs" },
  { id: "queued", label: "Queued", test: (j) => ["queued", "running", "checking"].includes(stateOf(j)) },
  { id: "hold", label: "On hold", test: (j) => stateOf(j) === "hold" },
  { id: "failed", label: "Didn't work", test: (j) => ["failed", "rejected"].includes(stateOf(j)) },
];

function Submissions({ pid, filter, open }: { pid: string; filter: string; open: { job: (id: string) => void } }) {
  const jobs = useApi<Job[]>("/api/jobs?kind=submission");
  const [checking, setChecking] = useState(false);
  const [adding, setAdding] = useState(false);
  if (!jobs) return <Loading />;
  const rows = jobs.filter((j) => j.productId === pid);
  const cols: Col<Job>[] = [
    { label: "Directory", value: (j) => j.subject, render: (j) => <span className="strong">{j.subject}</span> },
    { label: "Status", value: (j) => STATE[stateOf(j)][0], render: (j) => <StateTag job={j} /> },
    { label: "Detail", value: reasonOf, render: (j) => <span className="clip quiet" title={reasonOf(j)}>{reasonOf(j) || "—"}</span>, className: "wide" },
    { label: "Listing", value: (j) => j.listingUrl, render: (j) => (j.listingUrl ? <Ext href={j.listingUrl}>Open</Ext> : <span className="quiet">—</span>) },
    { label: "Updated", value: (j) => j.updatedAt, render: (j) => <span className="quiet"><When at={j.updatedAt} /></span>, className: "num" },
  ];
  const check = async () => {
    setChecking(true);
    const r = await post<{ results: { directory: string; result: string }[] }>("/api/submissions/check");
    setChecking(false);
    const live = (r.results ?? []).filter((x) => x.result.startsWith("live"));
    alert(live.length ? `Now live: ${live.map((x) => x.directory).join(", ")}` : `Checked ${(r.results ?? []).length} listings. None newly live.`);
  };
  return (
    <section className="page">
      <Head title="Submissions" aside={<div className="actions tight">
        <button className="ghost" onClick={() => setAdding(!adding)}>Add a listing</button>
        <button className="ghost" disabled={checking} onClick={check}>{checking ? "Checking…" : "Check listings in review"}</button>
      </div>}>
        Every directory your agent has worked on, plus listings you made yourself. Select one for its timeline.
      </Head>
      {adding && <AddListing pid={pid} done={() => setAdding(false)} />}
      <Table label="submissions" rows={rows} cols={cols} rowKey={(j) => j.id} onRow={(j) => open.job(j.id)} chips={SUB_CHIPS} initialChip={filter}
        sort={[cols.length - 1, -1]} empty="Nothing yet. Ask your agent to “continue my launch”." />
    </section>
  );
}

function AddListing({ pid, done }: { pid: string; done: () => void }) {
  const [target, setTarget] = useState("");
  const [url, setUrl] = useState("");
  const [outcome, setOutcome] = useState("pending");
  return (
    <form className="card add" onSubmit={async (e) => { e.preventDefault(); if (await act("/api/submissions/add", { product: pid, target, outcome, listingUrl: url })) done(); }}>
      <h2>Add a listing you made yourself</h2>
      <p className="quiet small">Agents won't submit there again, and “Check listings in review” tracks it like the rest. Use a registry directory id or any site's URL.</p>
      <div className="answer">
        <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Directory id or site URL" aria-label="Directory" required />
        <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Listing URL (optional)" aria-label="Listing URL" />
        <select value={outcome} onChange={(e) => setOutcome(e.target.value)} aria-label="Status">
          <option value="pending">In review</option>
          <option value="live">Live</option>
        </select>
        <button type="submit" disabled={!target.trim()}>Add</button>
        <button type="button" className="ghost" onClick={done}>Cancel</button>
      </div>
    </form>
  );
}

// ---- directories ------------------------------------------------------------

function Directories({ pid, open }: { pid: string; open: { job: (id: string) => void; dir: (id: string) => void } }) {
  const dirs = useApi<Dir[]>("/api/registry", 60000);
  const jobs = useApi<Job[]>("/api/jobs?kind=submission", 15000);
  const ratings = useApi<Ratings>("/api/ratings", 60000);
  const [kind, setKind] = useState("");
  if (!dirs || !jobs) return <Loading />;
  const sub = new Map(jobs.filter((j) => j.productId === pid).map((j) => [j.subject, j]));
  const dr = (d: Dir) => ratings?.directories[d.id] ?? null;
  const cols: Col<Dir>[] = [
    { label: "Directory", value: (d) => d.name, className: "wide", render: (d) => (
      <span className="stack"><span className="strong clip">{d.name}</span><span className="quiet small clip">{d.kind ? DIRECTORY_KINDS[d.kind] : "Unclassified"} · {host(d.website)}</span></span>
    ) },
    { label: "Cost", value: (d) => COST[d.cost.classification]?.[0] ?? d.cost.classification, render: (d) => <CostTag d={d} /> },
    { label: "Sign-in", value: signIn, render: (d) => <span className="clip short quiet" title={signIn(d)}>{signIn(d)}</span> },
    { label: "DR", value: (d) => dr(d) ?? -1, render: (d) => <span className="mono">{dr(d) ?? "—"}</span>, className: "num" },
    { label: "Your status", value: (d) => (sub.get(d.id) ? STATE[stateOf(sub.get(d.id)!)][0] : "Not tried"), render: (d) => (sub.get(d.id) ? <StateTag job={sub.get(d.id)!} /> : <span className="quiet">Not tried</span>) },
    { label: "Verified", value: (d) => d.verification.checked_at, render: (d) => <span className="quiet mono">{d.verification.checked_at}</span>, className: "num" },
  ];
  const chips: Chip<Dir>[] = [
    ...Object.entries(COST).map(([id, [label]]) => ({ id, label, test: (d: Dir) => d.cost.classification === id })),
    { id: "untried", label: "Not tried", test: (d) => !sub.has(d.id) },
  ];
  const rows = dirs.filter((d) => !kind || (d.kind ?? "unclassified") === kind);
  return (
    <section className="page">
      <Head title="Directories" aside={<UpdatesButton />}>
        The verified registry: {dirs.length} places to list a product, with cost, sign-in and the fields each form asks for.
      </Head>
      <UpdatesPanel />
      <Table label="directories" rows={rows} cols={cols} rowKey={(d) => d.id} chips={chips} sort={[3, -1]} onRow={(d) => open.dir(d.id)}
        tools={
          <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Type">
            <option value="">All types</option>
            {Object.entries(DIRECTORY_KINDS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            <option value="unclassified">Unclassified</option>
          </select>
        } />
    </section>
  );
}

/** Registry update state shared by the header button and the panel under it. */
type UpdatesState = { busy: boolean; result: Updates | null; error: string };
const updates = {
  state: { busy: false, result: null, error: "" } as UpdatesState,
  set(patch: Partial<UpdatesState>) { Object.assign(updates.state, patch); dispatchEvent(new Event("registry-updates")); },
  async run(apply: boolean) {
    updates.set({ busy: true, error: "" });
    const r = await post<Updates>("/api/registry/updates", { apply });
    updates.set({ busy: false, ...(r.error ? { error: r.error, result: null } : { result: r }) });
  },
};
function useUpdates() {
  const [, tick] = useState(0);
  useEffect(() => {
    const on = () => tick((n) => n + 1);
    addEventListener("registry-updates", on);
    return () => removeEventListener("registry-updates", on);
  }, []);
  return updates.state;
}

function UpdatesButton() {
  const s = useUpdates();
  return <button disabled={s.busy} onClick={() => updates.run(false)}>{s.busy ? "Checking…" : "Check for updates"}</button>;
}

function UpdatesPanel() {
  const s = useUpdates();
  const meta = useApi<Meta>("/api/meta", 60000);
  if (!s.result && !s.error) return null;
  const source = meta?.registrySource ?? "";
  if (s.error)
    return (
      <div className="notice red">
        <p><strong>Couldn't reach the dirpush registry.</strong> {s.error}</p>
        <p className="quiet small">Source: <code>{source}</code>. It's published from the dirpush repository; set <code>LAUNCH_REGISTRY_URL</code> to use another copy.</p>
        <button className="ghost" onClick={() => updates.set({ error: "" })}>Dismiss</button>
      </div>
    );
  const r = s.result!;
  const pending = r.added.length + r.changed.length;
  return (
    <div className={`notice ${pending && !r.applied ? "blue" : "green"}`}>
      <p>
        <strong>{r.applied ? `Applied ${pending} update${pending === 1 ? "" : "s"}.` : pending ? `${pending} update${pending === 1 ? "" : "s"} available.` : "Your registry is up to date."}</strong>{" "}
        <span className="quiet">Published {day(Date.parse(r.generatedAt))} · checked <When at={r.checkedAt} /></span>
      </p>
      {!r.applied && (r.added.length > 0 || r.changed.length > 0 || r.localNewer.length > 0) && (
        <dl className="diff">
          {r.added.length > 0 && <div><dt>New</dt><dd>{r.added.join(", ")}</dd></div>}
          {r.changed.length > 0 && <div><dt>Changed</dt><dd>{r.changed.join(", ")}</dd></div>}
          {r.localNewer.length > 0 && <div><dt>Kept yours</dt><dd>{r.localNewer.join(", ")} <span className="quiet">(you verified these more recently)</span></dd></div>}
        </dl>
      )}
      <div className="actions">
        {pending > 0 && !r.applied && <button disabled={s.busy} onClick={() => updates.run(true)}>Apply {pending} update{pending === 1 ? "" : "s"}</button>}
        <button className="ghost" onClick={() => updates.set({ result: null })}>Dismiss</button>
      </div>
    </div>
  );
}

// ---- product ----------------------------------------------------------------

function ProductView({ product }: { product: Product }) {
  const d = useApi<{ product: Product; galleries: Gallery[] }>(`/api/products/${encodeURIComponent(product.id)}`, 30000);
  const settings = useApi<{ identity: Record<string, string> & { error?: string }; permissions: Record<string, Record<string, string>> & { error?: string } }>("/api/settings", 60000);
  const ratings = useApi<Ratings>("/api/ratings", 60000);
  const meta = useApi<Meta>("/api/meta", 60000);
  if (!d) return <Loading />;
  const p = d.product;
  if (p.error) return <section className="page"><p className="notice red">{p.error}</p></section>;
  const list = (xs?: string[]) => (xs?.length ? xs.join(", ") : "—");
  const perms = settings && !settings.permissions.error ? Object.entries(settings.permissions).flatMap(([g, xs]) => Object.entries(xs).map(([k, mode]) => ({ action: `${g}.${k}`, mode }))) : [];
  const MODE: Record<string, Tone> = { automatic: "green", confirm: "yellow", never: "red" };
  return (
    <section className="page">
      <Head title={p.name ?? product.id}>{p.tagline}</Head>
      <p className="quiet small">Agents copy these facts into every form. Edit <code>workspace/products/{product.id}/product.yaml</code> to change them.</p>
      <DomainRating history={ratings?.products[product.id]} meta={meta} />
      <div className="gap-top">
        <section className="card">
          <h2>Facts</h2>
          <dl className="facts">
            <div><dt>Website</dt><dd><Ext href={p.url!} /></dd></div>
            <div><dt>Short</dt><dd>{p.descriptions?.short}</dd></div>
            {p.descriptions?.medium && <div><dt>Medium</dt><dd>{p.descriptions.medium}</dd></div>}
            <div><dt>Categories</dt><dd>{list(p.categories)}</dd></div>
            <div><dt>Pricing</dt><dd>{p.pricing?.free_plan ? "Free plan. " : ""}{p.pricing?.notes}</dd></div>
            {(p.country || p.launched) && <div><dt>Company</dt><dd>{[p.city, p.country].filter(Boolean).join(", ")}{p.launched && ` · launched ${p.launched}`}</dd></div>}
            {Object.entries((p.social ?? {}) as Record<string, string | null>).filter(([, v]) => v).map(([k, v]) => <div key={k}><dt>{k}</dt><dd><Ext href={v!} /></dd></div>)}
          </dl>
        </section>
      </div>
      {(p.features as string[] | undefined)?.length ? (
        <section className="block">
          <h2>Features</h2>
          <ul className="plain">{(p.features as string[]).map((f) => <li key={f}>{f}</li>)}</ul>
        </section>
      ) : null}
      <section className="block">
        <h2>Screenshots</h2>
        {d.galleries.length === 0 ? <p className="quiet">No screenshots proposed yet.</p> : d.galleries.slice(0, 1).map((g) => (
          <div key={g.revision}>
            <p className="quiet small">Revision {g.revision} · {g.status}</p>
            <ul className="shots">{g.items.map((i) => <li key={i.path}><img src={`/workspace/products/${product.id}/${i.path}`} alt={i.description} loading="lazy" /><span>{i.description}</span></li>)}</ul>
          </div>
        ))}
      </section>
      {settings && (
        <section className="block">
          <h2>Who agents sign up as</h2>
          {settings.identity.error ? <p className="quiet">{settings.identity.error}</p> : (
            <dl className="facts">{Object.entries(settings.identity).map(([k, v]) => <div key={k}><dt>{words(k)}</dt><dd>{v}</dd></div>)}</dl>
          )}
          <h2 className="gap">What agents may do</h2>
          <p className="quiet small">Automatic: just do it. Confirm: ask first. Never: stop. Edit <code>workspace/permissions.yaml</code>.</p>
          <ul className="perms">{perms.map((x) => <li key={x.action}><code>{x.action}</code><Tag tone={MODE[x.mode]}>{x.mode}</Tag></li>)}</ul>
        </section>
      )}
    </section>
  );
}

// ---- side panels ------------------------------------------------------------

function Panel({ title, sub, close, children }: { title: string; sub?: ReactNode; close: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && close();
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, []);
  return (
    <>
      <div className="backdrop" onClick={close} />
      <aside className="panel" role="dialog" aria-modal="true" aria-label={title}>
        <div className="panel-head">
          <div><h2>{title}</h2>{sub && <p className="quiet small">{sub}</p>}</div>
          <button className="ghost" onClick={close} autoFocus>Close</button>
        </div>
        {children}
      </aside>
    </>
  );
}

function JobPanel({ id, close, openDir }: { id: string; close: () => void; openDir: (id: string) => void }) {
  const d = useApi<{ job?: Job; events: Event[]; evidence: string[]; directory: Dir | { error: string } | null; error?: string }>(`/api/jobs/${id}`);
  const [url, setUrl] = useState("");
  const j = d?.job;
  const dir = d?.directory && !("error" in d.directory) ? d.directory : null;
  return (
    <Panel title={dir?.name ?? j?.subject ?? id} sub={j && <>{j.productId} · <When at={j.updatedAt} /></>} close={close}>
      {!d ? <Loading /> : d.error ? <p className="notice red">{d.error}</p> : j && (
        <>
          <p className="links">
            <StateTag job={j} />
            {dir && <button className="link" onClick={() => openDir(dir.id)}>Directory details</button>}
            {dir?.submission_url && <Ext href={dir.submission_url}>Submit page</Ext>}
            {j.listingUrl && <Ext href={j.listingUrl}>Your listing</Ext>}
          </p>
          {j.status === "blocked" && <div className="notice yellow"><p><Linkify text={j.blockMessage ?? ""} /></p></div>}
          {j.status === "failed" && (
            <div className="notice red">
              <p>{reasonOf(j)}</p>
              <button className="ghost" onClick={() => act(`/api/jobs/${j.id}/requeue`)}>Try again</button>
            </div>
          )}
          {j.status !== "done" && j.status !== "running" && (
            <details className="manual">
              <summary className="quiet small">Listed it yourself?</summary>
              <ManualForm compact onSave={(outcome, listingUrl) => act(`/api/jobs/${j.id}/manual`, { outcome, listingUrl })} />
            </details>
          )}
          {j.status === "done" && (
            <form className="answer" onSubmit={(e) => (e.preventDefault(), act(`/api/jobs/${j.id}/outcome`, { outcome: "live", listingUrl: url || j.listingUrl }))}>
              <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder={j.listingUrl ?? "Listing URL"} aria-label="Listing URL" />
              <button type="submit" disabled={j.outcome === "live" && !url}>Mark live</button>
              <button type="button" className="ghost" disabled={j.outcome === "rejected"} onClick={() => act(`/api/jobs/${j.id}/outcome`, { outcome: "rejected" })}>Rejected</button>
            </form>
          )}
          {d.evidence.length > 0 && (
            <>
              <h3>Evidence</h3>
              <ul className="shots">{d.evidence.map((f) => <li key={f}><a href={`/evidence/${j.id}/${encodeURIComponent(f)}`} target="_blank" rel="noreferrer"><img src={`/evidence/${j.id}/${encodeURIComponent(f)}`} alt={f} loading="lazy" /></a><span>{f}</span></li>)}</ul>
            </>
          )}
          <h3>Timeline</h3>
          <p className="quiet small">Everything that happened on this directory, newest first: what agents did, what you answered, and moderation results.</p>
          <Timeline events={d.events} />
          {Object.keys(j.data).length > 0 && (
            <details className="raw"><summary className="quiet small">Agent notes</summary><pre>{JSON.stringify(j.data, null, 2)}</pre></details>
          )}
        </>
      )}
    </Panel>
  );
}

function Timeline({ events }: { events: Event[] }) {
  const byDay = new Map<string, Event[]>();
  for (const e of [...events].sort((a, b) => b.at - a.at || b.id - a.id)) {
    const k = new Date(e.at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    byDay.set(k, [...(byDay.get(k) ?? []), e]);
  }
  return (
    <div className="timeline">
      {[...byDay].map(([label, es]) => (
        <section key={label}>
          <h4>{label}</h4>
          <ol>
            {es.map((e) => (
              <li key={e.id} className={e.worker === "human" || /unblocked|reply_to_target|added_manually/.test(e.type) ? "you" : ""}>
                <time className="quiet small">{new Date(e.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</time>
                <span><Linkify text={describe(e)} /></span>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

/** "I listed it myself": for a directory (or any site) the agents haven't finished. */
function ManualForm({ onSave, compact }: { onSave: (outcome: string, listingUrl: string) => Promise<boolean>; compact?: boolean }) {
  const [url, setUrl] = useState("");
  const [outcome, setOutcome] = useState("pending");
  return (
    <form className="answer" onSubmit={(e) => (e.preventDefault(), onSave(outcome, url).then((ok) => ok && setUrl("")))}>
      <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Listing URL (optional)" aria-label="Listing URL" />
      <select value={outcome} onChange={(e) => setOutcome(e.target.value)} aria-label="Status">
        <option value="pending">In review</option>
        <option value="live">Live</option>
      </select>
      <button type="submit">{compact ? "Save" : "I listed it myself"}</button>
    </form>
  );
}

function DirectoryPanel({ id, pid, close, openJob }: { id: string; pid: string; close: () => void; openJob: (id: string) => void }) {
  const d = useApi<{ directory: Dir; playbook: string | null; error?: string }>(`/api/registry/${encodeURIComponent(id)}`, 60000);
  const jobs = useApi<Job[]>("/api/jobs?kind=submission", 15000);
  const ratings = useApi<Ratings>("/api/ratings", 60000);
  const x = d?.directory;
  const job = jobs?.find((j) => j.productId === pid && j.subject === id);
  return (
    <Panel title={x?.name ?? id} sub={x && <Ext href={x.website} />} close={close}>
      {!d ? <Loading /> : d.error ? <p className="notice red">{d.error}</p> : x && (
        <>
          <p className="links">
            <CostTag d={x} />
            {job ? <button className="link" onClick={() => openJob(job.id)}>Your submission: {STATE[stateOf(job)][0]}</button> : <span className="quiet">Not tried yet</span>}
            {x.submission_url && <Ext href={x.submission_url}>Submit page</Ext>}
          </p>
          {!job && <ManualForm onSave={(outcome, listingUrl) => act("/api/submissions/add", { product: pid, target: id, outcome, listingUrl })} />}
          <dl className="facts gap-top">
            <div><dt>Type</dt><dd>{x.kind ? DIRECTORY_KINDS[x.kind] : "Unclassified"}</dd></div>
            {x.cost.notes && <div><dt>Cost</dt><dd>{x.cost.notes}</dd></div>}
            <div><dt>Sign-in</dt><dd>{signIn(x)}</dd></div>
            {x.review_time && <div><dt>Review</dt><dd>{x.review_time}</dd></div>}
            <div><dt>DR</dt><dd>{ratings?.directories[id] ?? "—"}</dd></div>
            <div><dt>Audience</dt><dd>{x.audience.join(", ") || "—"}</dd></div>
            {x.human_only && <div><dt>Human only</dt><dd>{x.human_only}</dd></div>}
            <div><dt>Verified</dt><dd>{x.verification.checked_at}</dd></div>
          </dl>
          {(x.submission.fields?.length ?? 0) > 0 && (
            <>
              <h3>Form fields</h3>
              <ul className="fields">
                {x.submission.fields!.map((f) => (
                  <li key={f.name}><span>{f.name}</span><span className="quiet small">{f.required ? "required" : "optional"}{f.limit ? ` · max ${f.limit}` : ""}</span></li>
                ))}
              </ul>
            </>
          )}
          {x.submission.conditions.length > 0 && (
            <>
              <h3>Conditions</h3>
              <ul className="plain">{x.submission.conditions.map((c) => <li key={c}>{c}</li>)}</ul>
            </>
          )}
          {d.playbook && (
            <>
              <h3>Playbook</h3>
              <div className="playbook">{d.playbook.replace(/^# .*\n+/, "")}</div>
            </>
          )}
        </>
      )}
    </Panel>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
