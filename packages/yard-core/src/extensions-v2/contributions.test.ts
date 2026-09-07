import { describe, expect, it } from "vitest";

import type { ExtensionV2CatalogEntry } from "./catalog";
import {
  contributionPointForType,
  inputFieldsForSchema,
  resolveV2PointContributions,
  sanitizeV2SelectionIds,
  validateV2DropCandidates,
} from "./contributions";
import { createGreeterFixtureDefinition } from "./fixture-definition";
import { toCatalogEntry } from "./catalog";

// Area: extension v2 R6 (#170). Contribution resolution: stable IDs,
// ordering, collisions, disposal filtering, context updates, and the
// data-only field/drop helpers behind the generic adapters.

function greeterEntry(): ExtensionV2CatalogEntry {
  return toCatalogEntry(createGreeterFixtureDefinition());
}

function entryWithContributions(
  id: string,
  contributions: ExtensionV2CatalogEntry["contributions"],
): ExtensionV2CatalogEntry {
  return {
    id,
    name: id,
    version: "0.1.0",
    description: `${id} fixture`,
    permissions: ["library:read"],
    commands: [
      {
        id: `${id}.run`,
        title: "Run thing",
        description: "Run it.",
        scope: "selection",
        destructive: false,
        requiresSelection: true,
        requiredCapabilities: [],
        docsId: "",
      },
    ],
    settings: [],
    contributions,
    docsRefs: [],
  };
}

const enabledState = (enabledIds: readonly string[] = ["fixture-greeter"]) => ({
  isEnabled: (id: string) => enabledIds.includes(id),
  capabilities: {},
  grantedPermissions: (id: string) =>
    id === "fixture-greeter" ? ["library:read"] : [],
});

describe("v2 contribution resolution", () => {
  it("maps every registered contribution type onto a renderer point", () => {
    expect(contributionPointForType("command-palette")).toBe("palette");
    expect(contributionPointForType("file-context-menu")).toBe("context-menu");
    expect(contributionPointForType("folder-context-menu")).toBe("context-menu");
    expect(contributionPointForType("selection-actions")).toBe("selection-actions");
    expect(contributionPointForType("toolbar")).toBe("toolbar");
    expect(contributionPointForType("sidebar")).toBe("sidebar");
    expect(contributionPointForType("settings")).toBe("settings");
    expect(contributionPointForType("drop-menu")).toBe("drop-menu");
  });

  it("resolves stable keys and attaches availability with reasons", () => {
    const available = resolveV2PointContributions(
      [greeterEntry()],
      "palette",
      { fileIds: ["abc"] },
      enabledState(),
    );
    expect(available).toHaveLength(1);
    expect(available[0]!.key).toBe("v2:fixture-greeter:fixture-greeter.palette-greet");
    expect(available[0]!.availability).toEqual({ available: true });

    const empty = resolveV2PointContributions(
      [greeterEntry()],
      "palette",
      { fileIds: [] },
      enabledState(),
    );
    expect(empty[0]!.key).toBe(available[0]!.key);
    expect(empty[0]!.availability.available).toBe(false);
    if (!empty[0]!.availability.available) {
      expect(empty[0]!.availability.reason).toMatch(/select/i);
    }
  });

  it("orders by order, then extension, then contribution id", () => {
    const entries = [
      entryWithContributions("ext-b", [
        { id: "ext-b.second", type: "toolbar", commandId: "ext-b.run", order: 10 },
        { id: "ext-b.first", type: "toolbar", commandId: "ext-b.run", order: 10 },
      ]),
      entryWithContributions("ext-a", [
        { id: "ext-a.late", type: "toolbar", commandId: "ext-a.run", order: 50 },
        { id: "ext-a.early", type: "toolbar", commandId: "ext-a.run", order: 5 },
        { id: "ext-a.unordered", type: "toolbar", commandId: "ext-a.run" },
      ]),
    ];
    const resolved = resolveV2PointContributions(
      entries,
      "toolbar",
      { fileIds: ["x"] },
      {
        isEnabled: () => true,
        capabilities: {},
        grantedPermissions: () => ["library:read"],
      },
    );
    expect(resolved.map((item) => item.contributionId)).toEqual([
      "ext-a.early",
      "ext-b.first",
      "ext-b.second",
      "ext-a.late",
      "ext-a.unordered",
    ]);
  });

  it("keeps both entries when one command is contributed twice (no silent dedup)", () => {
    const entries = [
      entryWithContributions("ext-a", [
        { id: "ext-a.one", type: "toolbar", commandId: "ext-a.run", order: 1 },
        { id: "ext-a.two", type: "toolbar", commandId: "ext-a.run", order: 2 },
      ]),
    ];
    const resolved = resolveV2PointContributions(
      entries,
      "toolbar",
      { fileIds: ["x"] },
      {
        isEnabled: () => true,
        capabilities: {},
        grantedPermissions: () => ["library:read"],
      },
    );
    expect(resolved.map((item) => item.key)).toEqual([
      "v2:ext-a:ext-a.one",
      "v2:ext-a:ext-a.two",
    ]);
  });

  it("excludes disabled extensions and unknown commands (disable/unregister removes UI)", () => {
    const disabled = resolveV2PointContributions(
      [greeterEntry()],
      "palette",
      { fileIds: ["abc"] },
      enabledState([]),
    );
    expect(disabled).toEqual([]);

    const dangling: ExtensionV2CatalogEntry = {
      ...greeterEntry(),
      contributions: [
        {
          id: "fixture-greeter.ghost",
          type: "command-palette",
          commandId: "fixture-greeter.missing",
        },
      ],
    };
    expect(
      resolveV2PointContributions(dangling ? [dangling] : [], "palette", {}, enabledState()),
    ).toEqual([]);
  });

  it("denies unknown capabilities with a user-readable reason", () => {
    const entries = [
      {
        ...entryWithContributions("ext-a", [
          { id: "ext-a.gated", type: "toolbar", commandId: "ext-a.run" },
        ]),
      },
    ];
    entries[0]!.commands[0]!.requiredCapabilities = ["desktop:reveal"];
    const resolved = resolveV2PointContributions(
      entries,
      "toolbar",
      { fileIds: ["x"] },
      {
        isEnabled: () => true,
        capabilities: {},
        grantedPermissions: () => ["library:read"],
      },
    );
    expect(resolved[0]!.availability.available).toBe(false);
    if (!resolved[0]!.availability.available) {
      expect(resolved[0]!.availability.code).toBe("capability-unavailable");
    }
  });

  it("serializes catalog entries with option-less settings and title-less contributions", () => {
    // R1 latent bug found by R6 fixtures: toCatalogEntry spread
    // `options: undefined` / `title: undefined` for undeclared
    // optionals, which its own serializer rejects. Option-less
    // string/boolean/number settings and title-less contributions
    // must project cleanly.
    const definition = {
      ...createGreeterFixtureDefinition(),
      id: "fixture-plain",
      settings: [
        { id: "fixture-plain.note", label: "Note", type: "string", defaultValue: "" },
        { id: "fixture-plain.count", label: "Count", type: "number", defaultValue: 3 },
      ],
      contributions: [
        { id: "fixture-plain.bare", type: "command-palette", commandId: "fixture-greeter.greet" },
      ],
    } as Parameters<typeof toCatalogEntry>[0];
    const entry = toCatalogEntry(definition);
    expect(entry.settings[0]).not.toHaveProperty("options");
    expect(entry.contributions[0]).not.toHaveProperty("title");
    expect(entry.contributions[0]).not.toHaveProperty("order");
  });

  it("sanitizes selection ids: drops non-strings and bounds the list", () => {
    expect(sanitizeV2SelectionIds(["a", "", "  ", 42, null, "b"])).toEqual(["a", "b"]);
    expect(sanitizeV2SelectionIds("nope")).toEqual([]);
    expect(sanitizeV2SelectionIds(Array.from({ length: 600 }, (_, i) => `id-${i}`))).toHaveLength(
      500,
    );
  });

  it("derives generic form fields from input schemas without extension branches", () => {
    expect(inputFieldsForSchema(undefined)).toEqual([]);
    expect(inputFieldsForSchema({ kind: "none" })).toEqual([]);
    const scalar = inputFieldsForSchema({ kind: "string", default: "hi" });
    expect(scalar).toHaveLength(1);
    expect(scalar[0]).toMatchObject({ name: "value", required: true, defaultValue: "hi" });
    const object = inputFieldsForSchema({
      kind: "object",
      properties: {
        name: { kind: "string", minLength: 1 },
        greeting: { kind: "enum", values: ["hello", "welcome"], default: "hello" },
      },
      required: ["name"],
    });
    expect(object.map((field) => field.name)).toEqual(["name", "greeting"]);
    expect(object[0]).toMatchObject({ required: true, defaultValue: "" });
    expect(object[1]).toMatchObject({ required: false, defaultValue: "hello" });
  });

  it("validates drop candidates: empty, oversized, and nameless entries rejected", () => {
    expect(validateV2DropCandidates([]).ok).toBe(false);
    expect(validateV2DropCandidates([{ name: "kick.wav" }])).toEqual({
      ok: true,
      fileCount: 1,
    });
    const oversized = validateV2DropCandidates(
      Array.from({ length: 5 }, (_, i) => ({ name: `f${i}.wav` })),
      { maxFiles: 4 },
    );
    expect(oversized.ok).toBe(false);
    expect(validateV2DropCandidates([{ name: "   " }]).ok).toBe(false);
  });
});
