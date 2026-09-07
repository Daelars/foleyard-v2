/**
 * Filesystem authorization guards for v2 operations (Yard Core context, R3).
 *
 * Applies the filesystem ADR protections to every v2 file operation:
 * canonical paths (symlinks/junctions resolved before containment),
 * traversal rejection, junction/symlink escape denial, existing-ancestor
 * resolution for new output paths, and root containment for both
 * readable Library roots and writable destination grants.
 *
 * The host injects the path primitives (`V2PathIo`); this module holds
 * the policy. Framework-free: no direct filesystem imports, so the
 * guards run identically against the application adapter and the
 * in-memory fakes used in tests.
 *
 * Validation-to-use limits, stated honestly: these checks authorize the
 * path at check time. Another local process can replace directories
 * between validation and use; the guards do not provide atomic
 * protection against that race. Output writes additionally stay inside
 * job-owned workspaces (see `operations.ts`) so a race cannot redirect
 * cleanup at unrelated files.
 */

export type V2PathIo = {
  /** Canonical path with links resolved; throws when the entry is missing. */
  realpath(candidate: string): Promise<string>;
  /**
   * Entry probe that does not follow the final link: reports whether
   * the entry exists at all and whether it is a link. A link whose
   * target cannot be resolved (dangling) is unsafe and denied.
   */
  lstat(candidate: string): Promise<{ exists: boolean; isLink: boolean }>;
};

export type V2PathDenial =
  | { ok: false; reason: "traversal" | "outside-root" | "missing" | "dangling-link"; message: string };

function separators(path: string): boolean {
  return path.includes("\0");
}

function splitSegments(path: string): string[] {
  return path.split(/[\\/]+/).filter((segment) => segment.length > 0);
}

/** Lexical traversal screen before any I/O: rejects `..` escapes and null bytes. */
export function screenV2CandidatePath(candidate: string): V2PathDenial | null {
  if (!candidate.trim()) {
    return { ok: false, reason: "missing", message: "A file path is required; provide a non-empty path." };
  }
  if (separators(candidate)) {
    return { ok: false, reason: "traversal", message: "The path contains an embedded null byte and is rejected." };
  }
  let rest = candidate;
  const driveMatch = /^[A-Za-z]:/.exec(candidate);
  if (driveMatch) {
    rest = candidate.slice(driveMatch[0].length);
  }
  const depth: string[] = [];
  for (const segment of splitSegments(rest)) {
    if (segment === ".") continue;
    if (segment === "..") {
      if (depth.length === 0) {
        return {
          ok: false,
          reason: "traversal",
          message: `The path ${JSON.stringify(candidate)} escapes its root with ".." and is rejected.`,
        };
      }
      depth.pop();
      continue;
    }
    depth.push(segment);
  }
  return null;
}

function isWithinRoot(candidate: string, root: string): boolean {
  const norm = (value: string): string[] => {
    const driveMatch = /^[A-Za-z]:/.exec(value);
    const withoutDrive = driveMatch ? value.slice(driveMatch[0].length) : value;
    return splitSegments(withoutDrive).map((segment) => segment.toLowerCase());
  };
  const rootDrive = (/^[A-Za-z]:/.exec(root)?.[0] ?? "").toLowerCase();
  const candidateDrive = (/^[A-Za-z]:/.exec(candidate)?.[0] ?? "").toLowerCase();
  if (rootDrive !== candidateDrive) return false;
  const rootSegments = norm(root);
  const candidateSegments = norm(candidate);
  if (candidateSegments.length < rootSegments.length) return false;
  return rootSegments.every((segment, index) => candidateSegments[index] === segment);
}

function joinSegments(base: string, missing: string[]): string {
  const separator = base.includes("\\") && !base.includes("/") ? "\\" : "/";
  const trimmed = base.replace(/[\\/]+$/, "");
  if (missing.length === 0) return trimmed;
  return `${trimmed}${separator}${missing.join(separator)}`;
}

function parentOf(path: string): string | null {
  const trimmed = path.replace(/[\\/]+$/, "");
  const index = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  if (index <= 0) return null;
  return trimmed.slice(0, index);
}

function baseOf(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, "");
  const index = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  return index === -1 ? trimmed : trimmed.slice(index + 1);
}

async function canonicalRoot(root: string, io: V2PathIo): Promise<string | null> {
  try {
    return await io.realpath(root);
  } catch {
    return null;
  }
}

/**
 * Authorize reading an existing path under one of the readable roots.
 * Returns the canonical path; denies traversal, missing entries,
 * dangling links, and containment escapes (including link escapes,
 * because containment is checked after `realpath`).
 */
export async function authorizeV2ReadablePath(
  candidate: string,
  roots: readonly string[],
  io: V2PathIo,
): Promise<{ ok: true; canonicalPath: string } | V2PathDenial> {
  const screened = screenV2CandidatePath(candidate);
  if (screened) return screened;
  let canonical: string;
  try {
    canonical = await io.realpath(candidate);
  } catch {
    const probe = await io.lstat(candidate).catch(() => ({ exists: false, isLink: false }));
    if (probe.exists) {
      return {
        ok: false,
        reason: "dangling-link",
        message: `The path ${JSON.stringify(candidate)} is a link with an unresolvable target and is rejected.`,
      };
    }
    return {
      ok: false,
      reason: "missing",
      message: `The path ${JSON.stringify(candidate)} does not exist in the Library; refresh and retry.`,
    };
  }
  for (const root of roots) {
    const canonicalRootPath = await canonicalRoot(root, io);
    if (canonicalRootPath && isWithinRoot(canonical, canonicalRootPath)) {
      return { ok: true, canonicalPath: canonical };
    }
  }
  return {
    ok: false,
    reason: "outside-root",
    message: `The path ${JSON.stringify(candidate)} is outside the readable Library roots and is rejected.`,
  };
}

/**
 * Authorize creating output under a writable grant root. Every existing
 * ancestor is resolved before missing segments are appended, so a
 * junction in an existing ancestor cannot redirect the output; the
 * final candidate must stay within the grant root.
 */
export async function authorizeV2WritablePath(
  candidate: string,
  grantRoot: string,
  io: V2PathIo,
): Promise<{ ok: true; canonicalPath: string } | V2PathDenial> {
  const screened = screenV2CandidatePath(candidate);
  if (screened) return screened;
  const canonicalGrant = await canonicalRoot(grantRoot, io);
  if (!canonicalGrant) {
    return {
      ok: false,
      reason: "missing",
      message: "The destination grant root is unavailable; choose an output folder again.",
    };
  }
  let ancestor = candidate;
  const missing: string[] = [];
  for (;;) {
    try {
      const canonicalAncestor = await io.realpath(ancestor);
      const resolved = joinSegments(canonicalAncestor, [...missing].reverse());
      if (!isWithinRoot(resolved, canonicalGrant)) {
        return {
          ok: false,
          reason: "outside-root",
          message: `The output path ${JSON.stringify(candidate)} escapes its destination grant and is rejected.`,
        };
      }
      return { ok: true, canonicalPath: resolved };
    } catch {
      const probe = await io.lstat(ancestor).catch(() => ({ exists: false, isLink: false }));
      if (probe.exists) {
        return {
          ok: false,
          reason: "dangling-link",
          message: `The path ${JSON.stringify(ancestor)} is a link with an unresolvable target and is rejected.`,
        };
      }
      const parent = parentOf(ancestor);
      if (!parent) {
        return {
          ok: false,
          reason: "outside-root",
          message: `The output path ${JSON.stringify(candidate)} cannot be contained in its destination grant and is rejected.`,
        };
      }
      missing.push(baseOf(ancestor));
      ancestor = parent;
    }
  }
}
