/**
 * Version-matched documentation locator + allowlisted reader.
 * Feature status: shipped. Contract: internal.
 * Development resolves the checkout root independently of cwd.
 * Packaged builds resolve staged foleyard-docs/ resources.
 * Unknown IDs and traversal attempts are rejected; reads never execute examples.
 */

import fs from "node:fs";
import path from "node:path";

export type DocumentStatus = "current" | "historical" | "experimental";

export type DocumentEntry = {
  id: string;
  relativePath: string;
  status: DocumentStatus;
  title: string;
};

export const DOCUMENT_REGISTRY: DocumentEntry[] = [
  { id: "index", relativePath: "docs/index.md", status: "current", title: "Documentation index" },
  { id: "quickstart", relativePath: "docs/quickstart.md", status: "current", title: "Quickstart" },
  { id: "development", relativePath: "docs/development.md", status: "current", title: "Development" },
  { id: "library", relativePath: "docs/library.md", status: "current", title: "Library" },
  { id: "scanning", relativePath: "docs/scanning.md", status: "current", title: "Scanning" },
  { id: "metadata", relativePath: "docs/metadata.md", status: "current", title: "Metadata" },
  { id: "playback", relativePath: "docs/playback.md", status: "current", title: "Playback and waveforms" },
  { id: "search", relativePath: "docs/search.md", status: "current", title: "Search" },
  { id: "collections", relativePath: "docs/collections.md", status: "current", title: "Collections" },
  { id: "filesystem", relativePath: "docs/filesystem.md", status: "current", title: "Filesystem" },
  { id: "settings", relativePath: "docs/settings.md", status: "current", title: "Settings" },
  { id: "database", relativePath: "docs/database.md", status: "current", title: "Database" },
  { id: "extensions", relativePath: "docs/extensions.md", status: "current", title: "Bundled extensions" },
  { id: "extensions-v2", relativePath: "docs/extensions-v2.md", status: "current", title: "Extension authoring (v2 API)" },
  { id: "extensions-v2-migration", relativePath: "docs/extensions-v2-migration.md", status: "current", title: "Extension v1 to v2 migration" },
  { id: "extensions-v2-make-pack", relativePath: "docs/extensions-v2-make-pack.md", status: "current", title: "Make Pack v2 walkthrough" },
  { id: "extensions-v2-troubleshooting", relativePath: "docs/extensions-v2-troubleshooting.md", status: "current", title: "Extension v2 troubleshooting" },
  { id: "commands", relativePath: "docs/commands.md", status: "current", title: "Commands" },
  { id: "events", relativePath: "docs/events.md", status: "current", title: "Events" },
  { id: "runtime", relativePath: "docs/runtime.md", status: "current", title: "Runtime introspection" },
  { id: "architecture/application", relativePath: "docs/architecture/application.md", status: "current", title: "Application architecture" },
  { id: "architecture/desktop", relativePath: "docs/architecture/desktop.md", status: "current", title: "Desktop architecture" },
  { id: "architecture/yard-core", relativePath: "docs/architecture/yard-core.md", status: "current", title: "yard-core architecture" },
  { id: "architecture/extensions", relativePath: "docs/architecture/extensions.md", status: "current", title: "Extension architecture" },
  { id: "adr/filesystem-access", relativePath: "docs/adr/filesystem-access.md", status: "current", title: "Filesystem access ADR" },
  { id: "readme", relativePath: "README.md", status: "current", title: "Product overview" },
];

function resolveWorkspaceRoot(): string {
  // Module-relative resolution, independent of incidental cwd.
  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, "package.json")) && fs.existsSync(path.join(dir, "docs"))) {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")) as { name?: string };
      if (pkg.name === "foleyard") return dir;
    }
    dir = path.dirname(dir);
  }
  return process.cwd();
}

function resolveDocsRoot(): { root: string; packaged: boolean } {
  // Packaged Electron stages docs under resources/foleyard-docs.
  const resourceRoot = process.env.FOLEYARD_DOCS_ROOT;
  if (resourceRoot && fs.existsSync(resourceRoot)) {
    return { root: resourceRoot, packaged: true };
  }
  const electronResources = (process as unknown as { resourcesPath?: string }).resourcesPath;
  const candidates = [
    electronResources ? path.join(electronResources, "foleyard-docs") : null,
  ].filter((v): v is string => !!v);
  for (const c of candidates) {
    if (fs.existsSync(c)) return { root: c, packaged: true };
  }
  return { root: resolveWorkspaceRoot(), packaged: false };
}

export function getDocumentationLocation() {
  const { root, packaged } = resolveDocsRoot();
  return {
    manifestId: "foleyard-docs",
    productVersion: "0.1.8",
    matched: true,
    indexId: "index",
    documentIds: DOCUMENT_REGISTRY.map((d) => d.id),
    examples: [
      { id: "extensions/selected-ids", runnableIn: "repository" as const },
      { id: "core/query-library", runnableIn: "repository" as const },
      { id: "extensions-v2/minimal", runnableIn: "repository" as const },
    ],
    ...(packaged ? {} : { localRoot: root }),
  };
}

export function readDocumentation(documentId: string): { id: string; content: string } {
  if (typeof documentId !== "string" || !documentId || documentId.includes("..") || documentId.includes("\\") || documentId.startsWith("/")) {
    throw new Error(`Unknown document "${documentId}".`);
  }
  const entry = DOCUMENT_REGISTRY.find((d) => d.id === documentId);
  if (!entry) throw new Error(`Unknown document "${documentId}".`);
  const { root } = resolveDocsRoot();
  const abs = path.resolve(root, entry.relativePath);
  if (!abs.startsWith(path.resolve(root) + path.sep) && abs !== path.resolve(root)) {
    throw new Error(`Unknown document "${documentId}".`);
  }
  if (!fs.existsSync(abs)) throw new Error(`Document "${documentId}" is missing from this build.`);
  return { id: documentId, content: fs.readFileSync(abs, "utf8") };
}

export function listDocumentIds(): string[] {
  return DOCUMENT_REGISTRY.map((d) => d.id);
}
