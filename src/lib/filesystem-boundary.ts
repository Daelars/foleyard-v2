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
