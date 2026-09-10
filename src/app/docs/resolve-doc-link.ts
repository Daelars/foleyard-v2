/**
 * Relative markdown link resolution for the in-app docs browser (#250).
 *
 * A served document's `.md` links are written relative to the document's
 * repository path (for example `../settings.md` from `docs/architecture/`).
 * The browser knows each document's path and id, so those links can be
 * rewritten to `/docs/<id>` and navigate inside the app. External links,
 * anchors, absolute paths and non-markdown targets are left untouched
 * (the caller sees `null` and keeps the original href).
 */

/** Normalize a repo-relative path against a base directory, or null on escape. */
export function normalizeDocPath(
  fromRelativePath: string,
  target: string,
): string | null {
  const baseSegments = fromRelativePath.split("/").slice(0, -1);
  const segments = target.replace(/\\/g, "/").split("/");
  const out = [...baseSegments];
  for (const segment of segments) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (out.length === 0) return null;
      out.pop();
      continue;
    }
    out.push(segment);
  }
  return out.join("/");
}

/**
 * Rewrite one href to an in-app docs route when it is a relative `.md`
 * link that resolves to a known document. Returns null to leave it as-is.
 */
export function resolveDocHref(
  fromRelativePath: string,
  href: string,
  docIdByPath: ReadonlyMap<string, string>,
): string | null {
  if (!href) return null;
  if (/^(https?:|mailto:|data:|#|\/|\\)/i.test(href)) return null;
  const [target, hash = ""] = href.split("#");
  if (!target || !target.toLowerCase().endsWith(".md")) return null;
  const resolved = normalizeDocPath(fromRelativePath, target);
  if (!resolved) return null;
  const id = docIdByPath.get(resolved);
  if (!id) return null;
  return `/docs/${id}${hash ? `#${hash}` : ""}`;
}
