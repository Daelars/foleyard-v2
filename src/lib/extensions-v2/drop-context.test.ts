import { describe, expect, it, vi } from "vitest";

import {
  DROP_RULES_V2_APPLY,
  DROP_RULES_V2_PREPARE_DRAG,
  DROP_RULES_V2_ID,
  createDropRulesV2Definition,
} from "@foleyard/drop-rules-v2";
import { toCatalogEntry, V2_EXTENSION_API_VERSION } from "@yard-core";
import {
  buildDropCommandInput,
  dropGrantSlot,
  findCatalogCommand,
  resolveDropFilesFromLibrary,
} from "./drop-context";

// Area: #283. The pure drop-context helpers turn a drop offer into the exact
// command input its schema declares; the definition is the real Drop Rules
// port, so the schema the helpers read is the shipped one.

const entry = toCatalogEntry(createDropRulesV2Definition());
const catalog = { apiVersion: V2_EXTENSION_API_VERSION, entries: [entry] };

describe("drop-context helpers", () => {
  it("finds the declared command and reads its grant slot from the schema", () => {
    const apply = findCatalogCommand(catalog, DROP_RULES_V2_ID, DROP_RULES_V2_APPLY);
    expect(apply?.id).toBe(DROP_RULES_V2_APPLY);
    expect(dropGrantSlot(apply)).toBe("destGrantId");

    const drag = findCatalogCommand(catalog, DROP_RULES_V2_ID, DROP_RULES_V2_PREPARE_DRAG);
    expect(dropGrantSlot(drag)).toBe("stagingGrantId");

    expect(findCatalogCommand(catalog, "other", DROP_RULES_V2_APPLY)).toBeNull();
    expect(dropGrantSlot(null)).toBeNull();
  });

  it("builds the file and grant input the command needs", () => {
    const apply = findCatalogCommand(catalog, DROP_RULES_V2_ID, DROP_RULES_V2_APPLY);
    expect(buildDropCommandInput(apply, ["a", "b"], "grant-1")).toEqual({
      fileIds: ["a", "b"],
      destGrantId: "grant-1",
    });
    // No grant picked yet: the file context is still supplied.
    expect(buildDropCommandInput(apply, ["a"], null)).toEqual({ fileIds: ["a"] });

    const drag = findCatalogCommand(catalog, DROP_RULES_V2_ID, DROP_RULES_V2_PREPARE_DRAG);
    expect(buildDropCommandInput(drag, ["a"], "stage-1")).toEqual({
      fileId: "a",
      stagingGrantId: "stage-1",
    });
  });

  it("resolves dropped names to Library ids by exact filename and reports the rest", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("kick.wav")) {
        return new Response(JSON.stringify({ files: [{ id: "a", filename: "kick.wav" }] }), {
          status: 200,
        });
      }
      if (url.includes("dup.wav")) {
        return new Response(
          JSON.stringify({ files: [{ id: "b", filename: "dup.wav" }, { id: "c", filename: "dup.wav" }] }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ files: [{ id: "x", filename: "other.wav" }] }), {
        status: 200,
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const resolved = await resolveDropFilesFromLibrary(["kick.wav", "dup.wav", "missing.wav"]);
      expect(resolved.fileIds).toEqual(["a", "b"]);
      expect(resolved.missing).toEqual(["missing.wav"]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("reports every name as missing when the Library request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    try {
      const resolved = await resolveDropFilesFromLibrary(["kick.wav"]);
      expect(resolved).toEqual({ fileIds: [], missing: ["kick.wav"] });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
