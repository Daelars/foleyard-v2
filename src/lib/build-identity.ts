/**
 * One reader for the running build's identity. Runtime introspection and
 * installed-documentation matching both consume this, so a staged manifest
 * cannot agree with one identity and disagree with another (#307).
 *
 * Absence is explicit: an unreadable or missing build id / source revision is
 * returned as `undefined`, never invented. Callers that verify agreement must
 * treat `undefined` as "unknown" and fail closed rather than as a match.
 *
 * Feature status: shipped. Contract: internal.
 */

import fs from "node:fs";
import path from "node:path";

export type BuildIdentity = {
  buildId?: string;
  sourceRevision?: string;
  sourceDirty?: boolean;
};

/**
 * Roots the packaged app identity is read from: Electron sets
 * FOLEYARD_APP_PATH; the working directory covers a server started in place.
 */
function buildRoots(): string[] {
  return [process.env.FOLEYARD_APP_PATH, process.cwd()].filter(
    (root): root is string => typeof root === "string" && root.length > 0,
  );
}

/** `.next/BUILD_ID`, trimmed; absent or blank is undefined. */
function readBuildIdFile(root: string): string | undefined {
  try {
    const candidate = path.join(root, ".next", "BUILD_ID");
    if (!fs.existsSync(candidate)) return undefined;
    const raw = fs.readFileSync(candidate, "utf8").trim();
    return raw || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Build provenance from `.next/build-provenance.json` (written after
 * `next build` by scripts/write-build-provenance.cjs), falling back to the raw
 * BUILD_ID when the file is absent or unreadable. Never throws: a missing or
 * malformed file yields an empty identity rather than an invented one.
 */
export function readBuildIdentity(roots: string[] = buildRoots()): BuildIdentity {
  let fallbackBuildId: string | undefined;
  for (const root of roots) {
    fallbackBuildId ??= readBuildIdFile(root);
    const provenancePath = path.join(root, ".next", "build-provenance.json");
    if (!fs.existsSync(provenancePath)) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(provenancePath, "utf8")) as {
        buildId?: unknown;
        sourceRevision?: unknown;
        sourceDirty?: unknown;
      };
      const buildId =
        typeof parsed.buildId === "string" && parsed.buildId
          ? parsed.buildId
          : readBuildIdFile(root);
      const sourceRevision =
        typeof parsed.sourceRevision === "string" ? parsed.sourceRevision : undefined;
      const sourceDirty =
        typeof parsed.sourceDirty === "boolean" ? parsed.sourceDirty : undefined;
      if (buildId || sourceRevision || sourceDirty !== undefined) {
        return { buildId, sourceRevision, sourceDirty };
      }
    } catch {
      // An unreadable provenance file is not fatal: the BUILD_ID fallback below
      // still supplies an identity, and absence stays explicit.
    }
  }
  return fallbackBuildId ? { buildId: fallbackBuildId } : {};
}

/**
 * The effective identity the running app reports: provenance plus the
 * explicit environment overrides the build sets (#241). Runtime identity and
 * docs matching must read this same object, not a second file.
 */
export function readRunningBuildIdentity(): BuildIdentity {
  const identity = readBuildIdentity();
  return {
    buildId: identity.buildId,
    sourceRevision: process.env.FOLEYARD_SOURCE_REVISION ?? identity.sourceRevision,
    sourceDirty:
      process.env.FOLEYARD_SOURCE_DIRTY === "true"
        ? true
        : process.env.FOLEYARD_SOURCE_DIRTY === "false"
          ? false
          : identity.sourceDirty,
  };
}
