/**
 * What the agent working this workspace can actually use: a browser driver, an email tool for verification
 * links and codes, anything else. The CLI detects what it can see (binaries on PATH); the agent records the rest
 * (its own MCP/connector tools) during setup, because only the agent knows which tools its harness gives it.
 * Stored in workspace/capabilities.yaml; no secrets.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { WORKSPACE } from "./workspace";

export const Capabilities = z.object({
  checked_at: z.string().optional(),
  checked_by: z.string().optional(), // agent/harness that recorded it, e.g. "claude-code"
  browser: z
    .object({
      tool: z.string().default("agent-browser"),
      notes: z.string().optional(),
    })
    .default({ tool: "agent-browser" }),
  email: z
    .object({
      available: z.boolean(),
      // How to reach it, in the agent's own words: "Executor Gmail app (tools.gmail.search, readMessage)",
      // "claude.ai Gmail connector", "IMAP via himalaya CLI"…
      tool: z.string().optional(),
      address: z.string().optional(), // the inbox it reads; should match identity.yaml email
      read_only: z.boolean().optional(), // true when the tool cannot send/delete/forward
      notes: z.string().optional(),
    })
    .default({ available: false }),
  notes: z.string().optional(),
});
export type Capabilities = z.infer<typeof Capabilities>;

export const CAPABILITIES = join(WORKSPACE, "capabilities.yaml");

export async function loadCapabilities(): Promise<Capabilities | null> {
  if (!existsSync(CAPABILITIES)) return null;
  return Capabilities.parse(Bun.YAML.parse(await Bun.file(CAPABILITIES).text()) ?? {});
}

/** Shallow-merges per section, so `set --input '{"email":{...}}'` leaves the browser entry alone. */
export async function saveCapabilities(patch: Record<string, unknown>, by?: string) {
  const prev = (await loadCapabilities()) ?? Capabilities.parse({});
  const merged: Record<string, unknown> = { ...prev };
  for (const [k, v] of Object.entries(patch)) {
    const old = (prev as Record<string, unknown>)[k];
    merged[k] = v && typeof v === "object" && !Array.isArray(v) && old && typeof old === "object" ? { ...old, ...v } : v;
  }
  const next = Capabilities.parse({ ...merged, checked_at: new Date().toISOString().slice(0, 10), ...(by && { checked_by: by }) });
  await Bun.write(CAPABILITIES, Bun.YAML.stringify(next, null, 2));
  return next;
}

/** What the CLI can see without the agent: browser driver binaries on PATH. */
export function detect() {
  const which = (bin: string) => Bun.which(bin);
  const ab = which("agent-browser");
  const version = ab ? Bun.spawnSync([ab, "--version"], { stdout: "pipe", stderr: "ignore" }).stdout.toString().trim() : null;
  return { agentBrowser: ab ? { path: ab, version } : null };
}
