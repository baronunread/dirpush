import { z } from "zod";
import { Directory, loadDirectories, loadDirectory, writeDirectory } from "./registry";

/** Where `registry updates` looks unless LAUNCH_REGISTRY_URL or --url says otherwise. Built by scripts/build-site.ts and redeployed monthly. */
export const DEFAULT_REGISTRY_URL = "https://dirpush.com/registry.json";
export const registrySource = () => process.env.LAUNCH_REGISTRY_URL ?? DEFAULT_REGISTRY_URL;

/** The published registry: every verified directory plus its playbook. Built by scripts/build-registry.ts. */
export const RegistryFile = z.object({
  revision: z.string(),
  generatedAt: z.string(),
  directories: z.array(z.object({ directory: Directory, playbook: z.string().nullable() })),
});
export type RegistryFile = z.infer<typeof RegistryFile>;

export async function buildRegistryFile(): Promise<RegistryFile> {
  const dirs = (await loadDirectories()).sort((a, b) => a.id.localeCompare(b.id));
  const directories = await Promise.all(dirs.map((d) => loadDirectory(d.id)));
  const digest = new Bun.CryptoHasher("sha256").update(JSON.stringify(directories)).digest("hex");
  return { revision: digest.slice(0, 16), generatedAt: new Date().toISOString(), directories };
}

/** `source`: an https URL or a local path to a registry.json. */
export async function fetchRegistryFile(source: string) {
  const text = /^https?:\/\//.test(source)
    ? await fetch(source, { signal: AbortSignal.timeout(30000) }).then((r) => {
        if (!r.ok) throw new Error(`registry download failed: HTTP ${r.status}`);
        return r.text();
      })
    : await Bun.file(source).text();
  return RegistryFile.parse(JSON.parse(text));
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Compares the published registry with the local one. A local entry verified more recently than the
 * published copy is kept: that is a correction you made and haven't reported yet.
 */
export async function registryUpdates(remote: RegistryFile, apply = false) {
  const local = new Map((await loadDirectories()).map((d) => [d.id, d]));
  const added: string[] = [], changed: string[] = [], localNewer: string[] = [];
  for (const { directory, playbook } of remote.directories) {
    const mine = local.get(directory.id);
    local.delete(directory.id);
    if (!mine) added.push(directory.id);
    else if (mine.verification.checked_at > directory.verification.checked_at) localNewer.push(directory.id);
    else if (!same(mine, directory) || !same((await loadDirectory(directory.id)).playbook, playbook)) changed.push(directory.id);
    else continue;
    if (apply && !localNewer.includes(directory.id)) await writeDirectory(directory, playbook ?? undefined);
  }
  // Removed upstream: reported, never deleted, so nothing you rely on disappears silently.
  return { revision: remote.revision, generatedAt: remote.generatedAt, applied: apply, added, changed, localNewer, onlyLocal: [...local.keys()].sort() };
}
