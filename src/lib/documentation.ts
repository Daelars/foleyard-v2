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

/** Provenance carried by a staged manifest; checkout manifests have none. */
export type DocsManifestIdentity = {
  productVersion: string | null;
  buildId: string | null;
  sourceRevision: string | null;
  sourceDirty: boolean | null;
  documentCount: number;
};

/** One identity field the staged manifest and the running build disagree on. */
export type DocsMismatch = {
  field: string;
  expected: string;
  actual: string;
};

export type DocsMatchState =
  | "matched"
  | "mismatched"
  | "unversioned"
  | "missing-manifest";

export type DocumentationLocation = {
  manifestId: string;
  productVersion: string;
  matched: boolean;
  matchState: DocsMatchState;
  mismatches: DocsMismatch[];
  manifest: DocsManifestIdentity | null;
  indexId: string;
  documentIds: string[];
  examples: DocumentationExample[];
  localRoot?: string;
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

function readBuildId(): string | undefined {
  try {
    const roots = [process.env.FOLEYARD_APP_PATH, process.cwd()].filter(
      (root): root is string => typeof root === "string" && root.length > 0,
    );
    for (const root of roots) {
      const candidate = path.join(root, ".next", "BUILD_ID");
      if (fs.existsSync(candidate)) {
        const raw = fs.readFileSync(candidate, "utf8").trim();
        if (raw) return raw;
      }
    }
  } catch {
    // Absence is explicit, not fatal.
  }
  return undefined;
}

/** Provenance block of a staged `manifest.json`; null when absent or invalid. */
function readStagedManifest(root: string): (DocsManifestIdentity & { documents: unknown[] }) | null {
  const manifestPath = path.join(root, "manifest.json");
  if (!fs.existsSync(manifestPath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
    return {
      productVersion: typeof parsed.productVersion === "string" ? parsed.productVersion : null,
      buildId: typeof parsed.buildId === "string" ? parsed.buildId : null,
      sourceRevision: typeof parsed.sourceRevision === "string" ? parsed.sourceRevision : null,
      sourceDirty: typeof parsed.sourceDirty === "boolean" ? parsed.sourceDirty : null,
      documentCount: Array.isArray(parsed.documents) ? parsed.documents.length : 0,
      documents: Array.isArray(parsed.documents) ? parsed.documents : [],
    };
  } catch {
    return null;
  }
}

/**
 * Docs location plus a real match verdict (#240). A packaged build compares
 * the staged manifest's product version, build id and source revision with
 * the running identity and names every mismatched field with both values. A
 * development checkout reports unversioned, and a staged root without a
 * manifest reports missing-manifest — never a constant `matched: true`.
 */
export function getDocumentationLocation(): DocumentationLocation {
  const { root, packaged } = resolveDocsRoot();
  const registry = readRegistry(root) ?? EMPTY_REGISTRY;
  const productVersion = (packageJson as { version: string }).version;
  const base = {
    manifestId: registry.manifestId,
    productVersion,
    indexId: "index",
    documentIds: registry.documents.map((d) => d.id),
    examples: registry.examples,
    ...(packaged ? {} : { localRoot: root }),
  };

  if (!packaged) {
    return {
      ...base,
      matched: false,
      matchState: "unversioned",
      manifest: null,
      mismatches: [
        {
          field: "manifest",
          expected: "staged version-matched manifest",
          actual: "development checkout",
        },
      ],
    };
  }

  const staged = readStagedManifest(root);
  if (!staged) {
    return {
      ...base,
      matched: false,
      matchState: "missing-manifest",
      manifest: null,
      mismatches: [
        {
          field: "manifest",
          expected: "manifest.json in the docs root",
          actual: "absent",
        },
      ],
    };
  }

  const mismatches: DocsMismatch[] = [];
  if (staged.productVersion !== productVersion) {
    mismatches.push({
      field: "productVersion",
      expected: productVersion,
      actual: staged.productVersion ?? "absent",
    });
  }
  const runningBuildId = readBuildId();
  if (staged.buildId && runningBuildId && staged.buildId !== runningBuildId) {
    mismatches.push({ field: "buildId", expected: runningBuildId, actual: staged.buildId });
  }
  const runningRevision = process.env.FOLEYARD_SOURCE_REVISION;
  if (staged.sourceRevision && runningRevision && staged.sourceRevision !== runningRevision) {
    mismatches.push({
      field: "sourceRevision",
      expected: runningRevision,
      actual: staged.sourceRevision,
    });
  }

  return {
    ...base,
    matched: mismatches.length === 0,
    matchState: mismatches.length === 0 ? "matched" : "mismatched",
    manifest: {
      productVersion: staged.productVersion,
      buildId: staged.buildId,
      sourceRevision: staged.sourceRevision,
      sourceDirty: staged.sourceDirty,
      documentCount: staged.documentCount,
    },
    mismatches,
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
