/**
 * The registry is shared and published: it must say what a directory is like, never what one product or one
 * operator did there. These helpers drop whole sentences that mention a workspace product, an operator, or
 * internal tooling.
 */
const INTERNAL = /workspace\/|\bdata\/|permissions?\.yaml|add_backlink|money\.spend|external\.\w|per (your|the user'?s?) instruction|\bvault\b|launch work|bun launch|agent-browser|scripts\/ab|LAUNCH_\w+|@gmail\.com|automatic review (rejected|blocked)|evidence: data/i;

export function scrubber(productWords: string[]) {
  const names = productWords.filter((w) => w.length >= 3).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const product = names.length ? new RegExp(`\\b(${names.join("|")})\\b`, "i") : null;
  const bad = (s: string) => INTERNAL.test(s) || (product?.test(s) ?? false);
  /** Keeps every sentence (or markdown line) that says nothing about a specific product or operator. */
  const text = (t: string) => (t.split(/(?<=[.!?])\s+|\n/).some(bad) ? clean(t) : t);
  const clean = (t: string) =>
    t
      .split("\n")
      .map((line) => line.split(/(?<=[.!?])\s+/).filter((s) => !bad(s)).join(" "))
      .filter((line, i, all) => line.trim() !== "" || (i > 0 && all[i - 1]!.trim() !== "" && !/^\s*[-*]\s*$/.test(all[i - 1]!)))
      .filter((line) => !/^\s*[-*]\s*$/.test(line))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  return { text, bad };
}
