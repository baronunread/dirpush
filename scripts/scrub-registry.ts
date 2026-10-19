/**
 * Removes sentences that talk about a specific workspace product or operator from the shared registry
 * (playbooks, cost notes, conditions, sources). Prints what changed; --dry-run writes nothing.
 */
import { join } from "node:path";
import { scrubber } from "../src/public";
import { loadDirectories, loadDirectory, REGISTRY, writeDirectory } from "../src/registry";
import { loadProduct, productIds } from "../src/workspace";

const dry = process.argv.includes("--dry-run");
const words = (await Promise.all(productIds().map((id) => loadProduct(id).catch(() => null)))).flatMap((p) =>
  p ? [p.name, new URL(p.url).hostname.replace(/^www\./, "").split(".")[0]!, ...Object.values(p.social).flatMap((u) => (u ? new URL(u).pathname.split("/").filter(Boolean).slice(0, 1) : []))] : [],
);
const { text } = scrubber([...new Set(words)]);
let changed = 0, removed = 0;
for (const d of await loadDirectories()) {
  const { playbook } = await loadDirectory(d.id);
  const next = {
    ...d,
    cost: { ...d.cost, notes: d.cost.notes ? text(d.cost.notes) || undefined : undefined },
    submission: { ...d.submission, conditions: d.submission.conditions.map(text).filter(Boolean) },
    verification: { ...d.verification, sources: d.verification.sources.filter((s) => !words.some((w) => s.toLowerCase().includes(w.toLowerCase()))) },
  };
  const nextPlaybook = playbook ? text(playbook) : null;
  if (JSON.stringify(next) === JSON.stringify(d) && nextPlaybook === playbook) continue;
  changed++;
  removed += (playbook?.length ?? 0) - (nextPlaybook?.length ?? 0) + (d.cost.notes?.length ?? 0) - (next.cost.notes?.length ?? 0);
  if (!dry) {
    await writeDirectory(next);
    if (playbook !== null) await Bun.write(join(REGISTRY, d.id, "playbook.md"), nextPlaybook ? nextPlaybook + "\n" : "");
  }
}
console.log(`${dry ? "Would change" : "Changed"} ${changed} directories (${removed} characters removed). Words: ${words.join(", ")}`);
