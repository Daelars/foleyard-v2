import { describe, expect, it } from "vitest";

import {
  ExtensionV2RegistrationError,
  ExtensionV2Registry,
  KNOWN_V2_UI_INTENTS,
  createGreeterFixtureDefinition,
  inputFieldsForSchema,
  resolveV2PointContributions,
  resolveV2UiIntent,
  toCatalogEntry,
  type ExtensionV2Command,
  type ExtensionV2Definition,
} from "./index";

// Area: extension v2 command UI intent (#294). A command declares the
// surface it needs before it can run: `direct`, `form`, `review`, or
// `confirm`. The catalog and the resolved contribution carry that
// declaration so the renderer never half-executes a command that needs
// a form, a plan review, or a confirmation.

function mutate(
  base: ExtensionV2Definition,
  patch: (draft: ExtensionV2Definition) => void,
): ExtensionV2Definition {
  const clone = JSON.parse(JSON.stringify(base)) as ExtensionV2Definition;
  clone.apiVersion = base.apiVersion;
  patch(clone);
  return clone;
}

function expectCode(definition: ExtensionV2Definition, code: string) {
  const registry = new ExtensionV2Registry();
  try {
    registry.register(definition);
  } catch (error) {
    expect(error).toBeInstanceOf(ExtensionV2RegistrationError);
    const codes = (error as ExtensionV2RegistrationError).diagnostics.map(
      (diagnostic) => diagnostic.code,
    );
    expect(codes).toContain(code);
    return error as ExtensionV2RegistrationError;
  }
  throw new Error(`Expected registration to fail with code "${code}"`);
}

describe("v2 command UI intent", () => {
  it("names the four surfaces a command can require", () => {
    expect([...KNOWN_V2_UI_INTENTS]).toEqual([
      "direct",
      "form",
      "review",
      "confirm",
    ]);
  });

  it("defaults an undeclared command to direct execution", () => {
    const command: ExtensionV2Command = {
      id: "fixture-greeter.greet",
      title: "Greet",
      description: "Greet.",
      scope: "global",
    };
    expect(resolveV2UiIntent(command)).toBe("direct");
  });

  it("carries the declared intent into the serializable catalog", () => {
    const definition = mutate(createGreeterFixtureDefinition(), (draft) => {
      draft.commands[0]!.ui = "form";
    });
    const entry = toCatalogEntry(definition);
    expect(entry.commands[0]!.ui).toBe("form");

    const plain = toCatalogEntry(createGreeterFixtureDefinition());
    expect(plain.commands[0]!.ui).toBe("direct");
  });

  it("resolves intent onto contributions so renderers route without branches", () => {
    const definition = mutate(createGreeterFixtureDefinition(), (draft) => {
      draft.commands[0]!.ui = "review";
    });
    const resolved = resolveV2PointContributions(
      [toCatalogEntry(definition)],
      "palette",
      { fileIds: ["abc"] },
      {
        isEnabled: () => true,
        capabilities: {},
        grantedPermissions: () => ["library:read"],
      },
    );
    expect(resolved).toHaveLength(1);
    expect(resolved[0]!.ui).toBe("review");
    // The declaration travels with the item, so the same resolution that
    // gates availability also tells the palette/dispatch which surface
    // the command needs.
    expect(inputFieldsForSchema(definition.commands[0]!.input)).toHaveLength(2);
  });

  it("rejects an unknown intent with an actionable diagnostic", () => {
    const error = expectCode(
      mutate(createGreeterFixtureDefinition(), (draft) => {
        draft.commands[0]!.ui = "hologram" as unknown as ExtensionV2Command["ui"];
      }),
      "unsupported-ui-intent",
    );
    expect(error.diagnostics[0]?.message).toMatch("hologram");
    expect(error.diagnostics[0]?.message).toMatch("direct");
  });

  it("accepts every known intent", () => {
    for (const ui of KNOWN_V2_UI_INTENTS) {
      const registry = new ExtensionV2Registry();
      const definition = mutate(createGreeterFixtureDefinition(), (draft) => {
        draft.commands[0]!.ui = ui;
      });
      expect(() => registry.register(definition)).not.toThrow();
    }
  });
});
