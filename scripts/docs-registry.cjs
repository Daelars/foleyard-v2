// Single-source reader and validator for `docs/manifest.json` (#236, #306).
//
// `docs/manifest.json` is the one registry: the application
// (`src/lib/documentation.ts`), the stager (`prepare-docs.cjs`) and the
// checker (`check-docs.cjs`) all read it. This module is the one place its
// shape is validated — status, audience, paths, duplicates and the required
// current documents — so the stager and the checker cannot disagree about
// what a valid registry is.
//
// `FOLEYARD_DOCS_MANIFEST` overrides the registry path; tests use it to feed a
// deliberately broken registry. Production builds never set it.

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_MANIFEST_PATH = path.join(__dirname, "..", "docs", "manifest.json");

/** `DocumentStatus` in `src/lib/documentation.ts`. */
const DOCUMENT_STATUSES = ["current", "historical", "experimental"];
/** Audience vocabulary used by `docs/manifest.json`. */
const DOCUMENT_AUDIENCES = ["users", "developers", "users+developers"];
/**
 * Documents the bundle cannot ship without, each carrying live (current)
 * content: the app hardcodes `indexId: "index"`, and `check-docs` requires the
 * staged `README.md` (id `readme`) and `docs/commands.md` (id `commands`).
 */
const REQUIRED_CURRENT_IDS = ["index", "readme", "commands"];

function resolveManifestPath() {
  const override = process.env.FOLEYARD_DOCS_MANIFEST;
  return override ? path.resolve(override) : DEFAULT_MANIFEST_PATH;
}

/**
 * A document path must stay inside the repository: relative, forward slashes,
 * no `.`/`..` segments, and a Markdown file. Anything else could escape the
 * staged output or resolve outside the docs root.
 */
function isSafeDocumentPath(value) {
  if (typeof value !== "string" || value.length === 0) return false;
  if (value.startsWith("/") || value.startsWith("\\")) return false;
  if (/^[A-Za-z]:/.test(value)) return false;
  if (value.includes("\\")) return false;
  const segments = value.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    return false;
  }
  return value.endsWith(".md");
}

/**
 * Structural, vocabulary and uniqueness validation of the registry entries.
 * Returns a list of human-readable problems, empty when the list is valid.
 */
function validateDocuments(documents) {
  const errors = [];
  const seenIds = new Set();
  const seenPaths = new Set();

  for (const entry of documents) {
    if (!entry || typeof entry !== "object") {
      errors.push(`manifest entry is not an object: ${JSON.stringify(entry)}`);
      continue;
    }
    const id = typeof entry.id === "string" ? entry.id.trim() : "";
    if (!id) {
      errors.push(`manifest entry needs a non-empty id: ${JSON.stringify(entry)}`);
    }
    const documentPath = typeof entry.path === "string" ? entry.path : "";
    if (!documentPath) {
      errors.push(`manifest entry "${id || "(unknown)"}" needs a path`);
    } else if (!isSafeDocumentPath(documentPath)) {
      errors.push(
        `manifest entry "${id}" has unsafe path "${documentPath}" ` +
          '(expected a relative .md path with no "..", backslashes or drive letter)',
      );
    }
    if (typeof entry.title !== "string" || entry.title.trim() === "") {
      errors.push(`manifest entry "${id}" needs a non-empty title`);
    }
    if (!DOCUMENT_STATUSES.includes(entry.status)) {
      errors.push(
        `manifest entry "${id}" has invalid status ${JSON.stringify(entry.status)} ` +
          `(expected ${DOCUMENT_STATUSES.join(" | ")})`,
      );
    }
    if (!DOCUMENT_AUDIENCES.includes(entry.audience)) {
      errors.push(
        `manifest entry "${id}" has invalid audience ${JSON.stringify(entry.audience)} ` +
          `(expected ${DOCUMENT_AUDIENCES.join(" | ")})`,
      );
    }
    if (id) {
      if (seenIds.has(id)) errors.push(`duplicate manifest id "${id}"`);
      seenIds.add(id);
    }
    if (documentPath) {
      if (seenPaths.has(documentPath)) {
        errors.push(`duplicate manifest path "${documentPath}" (id "${id}")`);
      }
      seenPaths.add(documentPath);
    }
  }

  for (const required of REQUIRED_CURRENT_IDS) {
    const match = documents.find((entry) => entry && entry.id === required);
    if (!match) {
      errors.push(`required current document "${required}" is missing from the manifest`);
    } else if (match.status !== "current") {
      errors.push(
        `required current document "${required}" has status "${match.status}", expected "current"`,
      );
    }
  }

  return errors;
}

/**
 * Read and validate the registry, and confirm every declared source exists in
 * the checkout. Returns the parsed manifest plus the document entries so the
 * caller keeps working with whatever it could read even when entries are
 * invalid.
 */
function validateRegistry(root, manifestPath) {
  const resolvedPath = manifestPath || resolveManifestPath();
  const errors = [];

  if (!fs.existsSync(resolvedPath)) {
    errors.push(`docs manifest not found: ${resolvedPath} (the registry is the single source)`);
    return { manifestPath: resolvedPath, manifest: null, documents: [], errors };
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
  } catch (error) {
    errors.push(`docs manifest is not valid JSON: ${error.message}`);
    return { manifestPath: resolvedPath, manifest: null, documents: [], errors };
  }

  if (!Array.isArray(parsed.documents) || parsed.documents.length === 0) {
    errors.push("docs manifest declares no documents");
    return { manifestPath: resolvedPath, manifest: parsed, documents: [], errors };
  }

  const documents = parsed.documents.filter((entry) => entry && typeof entry === "object");
  errors.push(...validateDocuments(documents));

  for (const entry of documents) {
    if (typeof entry.id !== "string" || typeof entry.path !== "string") continue;
    if (!isSafeDocumentPath(entry.path)) continue;
    if (!fs.existsSync(path.join(root, entry.path))) {
      errors.push(`registry source missing in checkout: ${entry.path} (id "${entry.id}")`);
    }
  }

  return { manifestPath: resolvedPath, manifest: parsed, documents, errors };
}

module.exports = {
  DEFAULT_MANIFEST_PATH,
  DOCUMENT_STATUSES,
  DOCUMENT_AUDIENCES,
  REQUIRED_CURRENT_IDS,
  isSafeDocumentPath,
  resolveManifestPath,
  validateDocuments,
  validateRegistry,
};
