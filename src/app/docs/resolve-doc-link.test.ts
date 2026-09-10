import { describe, expect, it } from "vitest";

import { normalizeDocPath, resolveDocHref } from "./resolve-doc-link";

// Area: #250. Relative .md links inside served documents resolve to in-app
// docs routes; external, anchor, absolute and non-markdown links do not.

const DOCS = new Map<string, string>([
  ["docs/index.md", "index"],
  ["docs/settings.md", "settings"],
  ["docs/extensions-v2.md", "extensions-v2"],
  ["docs/architecture/application.md", "architecture/application"],
]);

describe("normalizeDocPath", () => {
  it("resolves sibling and parent-relative targets", () => {
    expect(normalizeDocPath("docs/settings.md", "library.md")).toBe("docs/library.md");
    expect(
      normalizeDocPath("docs/architecture/application.md", "../settings.md"),
    ).toBe("docs/settings.md");
    expect(
      normalizeDocPath("docs/architecture/extensions.md", "yard-core.md"),
    ).toBe("docs/architecture/yard-core.md");
  });

  it("returns null when the target escapes the root", () => {
    expect(normalizeDocPath("docs/index.md", "../../outside.md")).toBeNull();
  });
});

describe("resolveDocHref", () => {
  it("rewrites known relative markdown links and keeps anchors", () => {
    expect(resolveDocHref("docs/index.md", "settings.md", DOCS)).toBe("/docs/settings");
    expect(resolveDocHref("docs/index.md", "settings.md#renderer", DOCS)).toBe(
      "/docs/settings#renderer",
    );
    expect(
      resolveDocHref("docs/architecture/application.md", "../extensions-v2.md", DOCS),
    ).toBe("/docs/extensions-v2");
  });

  it("leaves external, anchor, absolute and non-markdown links alone", () => {
    for (const href of [
      "https://example.com/settings.md",
      "mailto:dev@example.com",
      "#section",
      "/docs/settings",
      "src/lib/settings-schema.ts",
    ]) {
      expect(resolveDocHref("docs/index.md", href, DOCS), href).toBeNull();
    }
  });

  it("leaves unresolved relative links alone", () => {
    expect(resolveDocHref("docs/index.md", "missing.md", DOCS)).toBeNull();
    expect(resolveDocHref("docs/index.md", "../../outside.md", DOCS)).toBeNull();
  });
});
