import { describe, expect, it } from "vitest";

import { KNOWN_V2_PERMISSIONS } from "@yard-core";

import { getDocumentationRegistry } from "./documentation";
import { CAPABILITIES, getAvailableCapabilityIds } from "./capabilities";

// Area: #244. The catalog links into the served docs, uses the extension
// permission vocabulary, and derives availability from actual composition.

describe("capability catalog", () => {
  it("links every capability to a served docs id", () => {
    const docsIds = new Set(
      getDocumentationRegistry().documents.map((document) => document.id),
    );
    for (const capability of CAPABILITIES) {
      expect(docsIds.has(capability.docsId), `${capability.id} -> ${capability.docsId}`).toBe(
        true,
      );
    }
  });

  it("uses the v2 extension permission vocabulary", () => {
    const known = new Set<string>(KNOWN_V2_PERMISSIONS);
    for (const capability of CAPABILITIES) {
      for (const permission of capability.requiredPermissions) {
        expect(known.has(permission), `${capability.id}: ${permission}`).toBe(true);
      }
    }
  });

  it("derives the available set from actual composition", () => {
    const web = getAvailableCapabilityIds({
      hasServerServices: true,
      desktopAvailable: false,
    });
    expect(web.has("library.read")).toBe(true);
    expect(web.has("desktop.native")).toBe(false);

    const desktop = getAvailableCapabilityIds({
      hasServerServices: true,
      desktopAvailable: true,
    });
    expect(desktop.has("desktop.native")).toBe(true);
    expect(desktop.has("library.read")).toBe(true);

    const noServices = getAvailableCapabilityIds({
      hasServerServices: false,
      desktopAvailable: false,
    });
    expect(noServices.has("library.read")).toBe(false);
  });
});
