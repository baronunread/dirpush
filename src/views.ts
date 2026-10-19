/**
 * What agents see. Every CLI result passes through `present`: jobs, events and directories become compact rows
 * (readable times, clipped messages, no nulls) so a list costs hundreds of tokens, not hundreds of thousands.
 * `--full` returns the raw rows.
 */
type Obj = Record<string, unknown>;

export const iso = (ms: unknown) => (typeof ms === "number" && ms > 0 ? new Date(ms).toISOString().replace(/\.\d+Z$/, "Z") : undefined);
export const clip = (s: unknown, n = 200) => (typeof s === "string" && s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Drops null/undefined/empty values so rows only carry what matters. */
export function prune<T extends Obj>(o: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && !v.length) && !(typeof v === "object" && !Array.isArray(v) && v && !Object.keys(v).length)),
  ) as Partial<T>;
}

const isJob = (v: Obj) => typeof v.id === "string" && "kind" in v && "subject" in v && "status" in v && "step" in v;
const isEvent = (v: Obj) => "type" in v && "at" in v && "jobId" in v && "data" in v;
const isDirectory = (v: Obj) => typeof v.id === "string" && typeof v.cost === "object" && "verification" in v && "submission" in v;

/** Long strings inside saved job data (agent notes, hosted payloads) are clipped, structure kept. */
function clipDeep(v: unknown, n = 400): unknown {
  if (typeof v === "string") return clip(v, n);
  if (Array.isArray(v)) return v.slice(0, 20).map((x) => clipDeep(x, n));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clipDeep(x, n)]));
  return v;
}

const JOB_KEYS = new Set(["id", "kind", "subject", "productId", "status", "step", "worker", "leaseExpiresAt", "notBefore", "attempts", "blockType", "blockMessage", "lastError", "outcome", "listingUrl", "data", "createdAt", "updatedAt"]);

export function jobView(j: Obj, withData = false) {
  const extra = Object.fromEntries(Object.entries(j).filter(([k]) => !JOB_KEYS.has(k))); // e.g. inRegistry from submissions add
  // Same field names as the raw row (the skill refers to them); only pruned, clipped and with readable times.
  return prune({
    id: j.id, kind: j.kind !== "submission" ? j.kind : undefined, subject: j.subject, productId: j.productId, status: j.status, step: j.step,
    outcome: j.outcome, listingUrl: j.listingUrl,
    blockType: j.blockType, blockMessage: clip(j.blockMessage, withData ? 1000 : 200),
    lastError: clip(j.lastError, withData ? 1000 : 200), worker: j.worker, leaseExpiresAt: iso(j.leaseExpiresAt), notBefore: iso(j.notBefore),
    attempts: j.attempts || undefined, updatedAt: iso(j.updatedAt),
    data: withData && j.data && typeof j.data === "object" && Object.keys(j.data).length ? clipDeep(j.data) : undefined,
    ...extra,
  });
}

export function eventView(e: Obj) {
  const data = (e.data ?? {}) as Obj;
  const note = data.note ?? data.message ?? data.reason ?? data.detail ?? data.step ?? data.outcome ?? data.to;
  return prune({ at: iso(e.at), type: e.type, by: e.worker, note: clip(typeof note === "string" ? note : note === undefined ? undefined : JSON.stringify(note), 200) });
}

export function directoryRow(d: Obj) {
  const auth = d.authentication as { required?: boolean; methods?: string[] } | undefined;
  const link = d.link as { rel?: string; bot_check?: string; noindex?: boolean | null } | undefined;
  return prune({
    id: d.id, name: d.name, kind: d.kind ?? "listing", cost: (d.cost as Obj).classification, link: link?.rel,
    signIn: auth?.required ? (auth.methods?.join(", ") || "account") : "none", botCheck: link?.bot_check !== "none" ? link?.bot_check : undefined,
    noindex: link?.noindex || undefined, humanOnly: clip(d.human_only, 120), submitUrl: d.submission_url, fit: d.fit,
  });
}

/** Rows inside lists are compact. A single job (work next/show/claim) keeps its saved data, needed to resume. */
export function present(v: unknown, inList = false): unknown {
  if (Array.isArray(v)) return v.map((x) => present(x, true));
  if (!v || typeof v !== "object") return v;
  const o = v as Obj;
  if (isJob(o)) return jobView(o, !inList);
  if (isEvent(o)) return eventView(o);
  if (isDirectory(o) && inList) return directoryRow(o);
  return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, present(x, false)]));
}
