import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function isWithinRoot(candidate: string, root: string, allowRoot: boolean) {
  const relative = path.relative(root, candidate);
  if (relative === "") {
    return allowRoot;
  }

  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

export async function resolveExistingPathWithinRoots(
  candidatePath: string,
  rootPaths: string[],
  options: { allowRoot?: boolean } = {},
) {
  let candidate: string;
  try {
    candidate = await fs.promises.realpath(candidatePath);
  } catch {
    return null;
  }

  for (const rootPath of rootPaths) {
    try {
      const root = await fs.promises.realpath(rootPath);
      if (isWithinRoot(candidate, root, options.allowRoot ?? true)) {
        return candidate;
      }
    } catch {
      continue;
    }
  }

  return null;
}

const grants = new Map<string, string>();

export async function registerGrant(directoryPath: string) {
  const directory = await fs.promises.realpath(directoryPath);
  if (!(await fs.promises.stat(directory)).isDirectory()) throw new Error("Choose a directory with the folder picker");
  const grantToken = randomUUID();
  grants.set(grantToken, directory);
  return { path: directory, grantToken };
}

export const resolveReadablePath = resolveExistingPathWithinRoots;

// Resolve every existing ancestor before appending a new output path. This also rejects junction escapes.
export async function resolveWritablePath(candidatePath: string, grantToken: string) {
  const root = grants.get(grantToken);
  if (!root) return null;
  let ancestor = path.resolve(candidatePath);
  const missing: string[] = [];
  for (;;) {
    try {
      const canonical = await fs.promises.realpath(ancestor);
      const candidate = path.resolve(canonical, ...missing.reverse());
      return isWithinRoot(candidate, root, true) ? candidate : null;
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") return null;
      // A dangling link is an existing entry, not a safe missing directory.
      try { await fs.promises.lstat(ancestor); return null; } catch (entryError) {
        if (!(entryError instanceof Error) || !("code" in entryError) || entryError.code !== "ENOENT") return null;
      }
      const parent = path.dirname(ancestor);
      if (parent === ancestor) return null;
      missing.push(path.basename(ancestor));
      ancestor = parent;
    }
  }
}

export async function resolveGrantedExistingPath(candidatePath: string) {
  return resolveReadablePath(candidatePath, [...grants.values()]);
}
