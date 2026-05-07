import { normalizeDirectoryPath } from "@yard-core";

import { sqlite } from "./connection";

export function getUniqueDirectories() {
  const rows = sqlite
    .prepare(
      "SELECT DISTINCT directory FROM files WHERE directory IS NOT NULL AND removed_at IS NULL ORDER BY directory ASC",
    )
    .all() as Array<{ directory: string }>;

  return rows.map((row) => row.directory);
}

export function getSubdirectories(parentDir: string | null) {
  const allDirs = getUniqueDirectories();
  const subdirs = new Set<string>();

  for (const dir of allDirs) {
    if (parentDir === null) {
      const firstPart = dir.split(/[\\/]/)[0];
      if (firstPart) {
        subdirs.add(firstPart);
      }
      continue;
    }

    const normalizedParent = normalizeDirectoryPath(parentDir);
    const normalizedDir = normalizeDirectoryPath(dir);

    if (normalizedDir.startsWith(`${normalizedParent}/`)) {
      const remaining = normalizedDir.slice(normalizedParent.length + 1);
      const nextPart = remaining.split("/")[0];
      if (nextPart) {
        subdirs.add(`${parentDir}/${nextPart}`);
      }
    }
  }

  return Array.from(subdirs).sort();
}
