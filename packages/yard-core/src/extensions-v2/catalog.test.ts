import { describe, expect, it } from "vitest";

import {
  ExtensionV2CatalogError,
  ExtensionV2Registry,
  createGreeterFixtureDefinition,
  parseCatalog,
  serializeCatalog,
  validateV2Value,
} from "./index";

// Area: extension v2 R1 (#165). The catalog is the serializable projection
// of registered definitions: JSON round-trips must preserve it, and the
// serializer must throw on function leakage instead of letting JSON
// silently drop function values.

describe("ExtensionV2Catalog serialization", () => {
  it("round-trips the fixture catalog through JSON without loss", () => {
    const registry = new ExtensionV2Registry();
    registry.register(createGreeterFixtureDefinition());
    const catalog = registry.buildCatalog();

    const revived = parseCatalog(serializeCatalog(catalog));

    expect(revived).toEqual(catalog);
  });

  it("detects function leakage instead of silently dropping it", () => {
    const registry = new ExtensionV2Registry();
    registry.register(createGreeterFixtureDefinition());
    const catalog = registry.buildCatalog();
    const tainted = JSON.parse(JSON.stringify(catalog)) as typeof catalog;
    (tainted.entries[0]!.commands[0] as unknown as Record<string, unknown>)[
      "validate"
    ] = () => null;

    let thrown: unknown;
    try {
      serializeCatalog(tainted);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ExtensionV2CatalogError);
    // JSON.stringify would drop the key and succeed; we must fail loudly.
    expect(JSON.stringify(tainted)).not.toContain("validate");
    expect((thrown as ExtensionV2CatalogError).path).toMatch(
      /entries\[0\]\.commands\[0\]/,
    );
  });

  it("rejects symbol, bigint, and undefined payloads", () => {
    expect(() => serializeCatalog({ marker: Symbol("x") })).toThrow(
      ExtensionV2CatalogError,
    );
    expect(() => serializeCatalog({ marker: BigInt(10) })).toThrow(
      ExtensionV2CatalogError,
    );
    expect(() => serializeCatalog({ marker: undefined })).toThrow(
      ExtensionV2CatalogError,
    );
  });

  it("rejects malformed catalog envelopes on parse", () => {
    expect(() => parseCatalog("not json")).toThrow(ExtensionV2CatalogError);
    expect(() => parseCatalog(JSON.stringify({}))).toThrow(
      ExtensionV2CatalogError,
    );
    expect(() =>
      parseCatalog(JSON.stringify({ apiVersion: 1, entries: [] })),
    ).toThrow(ExtensionV2CatalogError);
  });
});

describe("validateV2Value", () => {
  it("validates runtime input against machine-readable schemas", () => {
    expect(
      validateV2Value({ kind: "string", minLength: 2 }, "hi"),
    ).toBeNull();
    expect(validateV2Value({ kind: "string", minLength: 2 }, "x")).toMatch(
      /at least 2/,
    );
    expect(
      validateV2Value({ kind: "enum", values: ["a", "b"] }, "c"),
    ).toMatch(/one of/);
    expect(
      validateV2Value(
        {
          kind: "object",
          properties: { name: { kind: "string" } },
          required: ["name"],
        },
        {},
      ),
    ).toMatch(/name/);
    expect(
      validateV2Value(
        {
          kind: "object",
          properties: { name: { kind: "string" } },
          required: ["name"],
        },
        { name: "Ada" },
      ),
    ).toBeNull();
    expect(validateV2Value({ kind: "string-array" }, ["a", 1])).toMatch(
      /string/,
    );
    expect(validateV2Value({ kind: "none" }, { unexpected: true })).toMatch(
      /no input/,
    );
  });
});
