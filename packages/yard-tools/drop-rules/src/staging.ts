import fs from "node:fs/promises";
import path from "node:path";

const PREFIX = "foleyard-drag-";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export async function createDragStage(parent: string, now = Date.now()) {
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.realpath(parent);
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    if (!entry.name.startsWith(PREFIX) || !entry.isDirectory() || entry.isSymbolicLink()) continue;
    const candidate = path.join(root, entry.name);
    const stats = await fs.lstat(candidate);
    if (stats.isSymbolicLink() || now - stats.mtimeMs < MAX_AGE_MS) continue;
    const canonical = await fs.realpath(candidate);
    if (path.dirname(canonical) !== root) continue;
    await fs.rm(canonical, { recursive: true, force: true });
  }
  return fs.mkdtemp(path.join(root, PREFIX));
}
