/**
 * Version-matched documentation locator + allowlisted reader.
 * Feature status: shipped. Contract: internal.
 *
 * `docs/manifest.json` is the single registry: the application, the
 * staging script and the check script all read it, so a document cannot
 * be declared in one place and forgotten in another (#236). Development
 * resolves the checkout root independently of cwd; packaged builds read
 * the staged `foleyard-docs/manifest.json`.
 *
 * Unknown IDs and traversal attempts are rejected; reads never execute
 * examples.
 */

import fs from "node:fs";
import path from "node:path";

import packageJson from "../../package.json";

export type DocumentStatus = "current" | "historical" | "experimental";

export type DocumentEntry = {
  id: string;
  relativePath: string;
  title: string;
  status: DocumentStatus;
  audience: string | null;
};

export type DocumentationExample = {
  id: string;
  runnableIn: "repository";
};

export type DocumentationRegistry = {
  manifestId: string;
  documents: DocumentEntry[];
  examples: DocumentationExample[];
};

const EMPTY_REGISTRY: DocumentationRegistry = {
  manifestId: "foleyard-docs",
  documents: [],
  examples: [],
};

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

function parseDocumentStatus(value: unknown): DocumentStatus {
  if (value === "historical" || value === "experimental") return value;
  return "current";
}

/** Read the registry from a staged root (`manifest.json`) or checkout (`docs/manifest.json`). */
function readRegistry(root: string): DocumentationRegistry | null {
  const candidates = [
    path.join(root, "manifest.json"),
    path.join(root, "docs", "manifest.json"),
  ];
  for (const manifestPath of candidates) {
    if (!fs.existsSync(manifestPath)) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
        manifestId?: unknown;
        documents?: unknown;
        examples?: unknown;
      };
      if (!Array.isArray(parsed.documents)) continue;
      const documents = parsed.documents.flatMap((raw): DocumentEntry[] => {
        if (!raw || typeof raw !== "object") return [];
        const doc = raw as Record<string, unknown>;
        const id = typeof doc.id === "string" ? doc.id : null;
        const relativePath =
          typeof doc.path === "string"
            ? doc.path
            : typeof doc.relativePath === "string"
              ? doc.relativePath
              : null;
        if (!id || !relativePath) return [];
        return [{
          id,
          relativePath,
          title: typeof doc.title === "string" ? doc.title : id,
          status: parseDocumentStatus(doc.status),
          audience: typeof doc.audience === "string" ? doc.audience : null,
        }];
      });
      const examples = Array.isArray(parsed.examples)
        ? parsed.examples.flatMap((raw): DocumentationExample[] => {
            if (!raw || typeof raw !== "object") return [];
            const example = raw as Record<string, unknown>;
            if (typeof example.id !== "string") return [];
            return [{ id: example.id, runnableIn: "repository" as const }];
          })
        : [];
      return {
        manifestId:
          typeof parsed.manifestId === "string" ? parsed.manifestId : "foleyard-docs",
        documents,
        examples,
      };
    } catch {
      // A malformed manifest is reported by check-docs; the reader falls
      // through to an empty registry rather than crashing a route.
    }
  }
  return null;
}

export function getDocumentationRegistry(): DocumentationRegistry {
  const { root } = resolveDocsRoot();
  return readRegistry(root) ?? EMPTY_REGISTRY;
}

export function getDocumentationLocation() {
  const { root, packaged } = resolveDocsRoot();
  const registry = readRegistry(root) ?? EMPTY_REGISTRY;
  return {
    manifestId: registry.manifestId,
    productVersion: (packageJson as { version: string }).version,
    matched: true,
    indexId: "index",
    documentIds: registry.documents.map((d) => d.id),
    examples: registry.examples,
    ...(packaged ? {} : { localRoot: root }),
  };
}

export function readDocumentation(documentId: string): { id: string; content: string } {
  if (typeof documentId !== "string" || !documentId || documentId.includes("..") || documentId.includes("\\") || documentId.startsWith("/")) {
    throw new Error(`Unknown document "${documentId}".`);
  }
  const { root } = resolveDocsRoot();
  const entry = (readRegistry(root) ?? EMPTY_REGISTRY).documents.find((d) => d.id === documentId);
  if (!entry) throw new Error(`Unknown document "${documentId}".`);
  const abs = path.resolve(root, entry.relativePath);
  if (!abs.startsWith(path.resolve(root) + path.sep) && abs !== path.resolve(root)) {
    throw new Error(`Unknown document "${documentId}".`);
  }
  if (!fs.existsSync(abs)) throw new Error(`Document "${documentId}" is missing from this build.`);
  return { id: documentId, content: fs.readFileSync(abs, "utf8") };
}

export function listDocumentIds(): string[] {
  const { root } = resolveDocsRoot();
  return (readRegistry(root) ?? EMPTY_REGISTRY).documents.map((d) => d.id);
}
