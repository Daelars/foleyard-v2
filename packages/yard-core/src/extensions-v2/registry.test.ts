import { describe, expect, it } from "vitest";

import {
  ExtensionV2RegistrationError,
  ExtensionV2Registry,
  V2_EXTENSION_API_VERSION,
  createGreeterFixtureDefinition,
  type ExtensionV2Contribution,
  type ExtensionV2Definition,
} from "./index";

// Area: extension v2 R1 (#165). Fixture-first specification of the v2
// registry: one explicit registration entry, duplicate/namespace/compat
// validation with actionable diagnostics, and runtime-usable schemas.

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

describe("ExtensionV2Registry", () => {
  it("registers the fixture through one explicit entry with no host branches", () => {
    const registry = new ExtensionV2Registry();
    const fixture = createGreeterFixtureDefinition();

    registry.register(fixture);

    expect(registry.has("fixture-greeter")).toBe(true);
    expect(registry.get("fixture-greeter")?.name).toBe("Fixture Greeter");
    expect(registry.ids()).toEqual(["fixture-greeter"]);
    const catalog = registry.buildCatalog();
    expect(catalog.apiVersion).toBe(V2_EXTENSION_API_VERSION);
    expect(catalog.entries.map((entry) => entry.id)).toEqual([
      "fixture-greeter",
    ]);
  });

  it("rejects a duplicate extension id", () => {
    const registry = new ExtensionV2Registry();
    registry.register(createGreeterFixtureDefinition());
    expect(() => registry.register(createGreeterFixtureDefinition())).toThrow(
      ExtensionV2RegistrationError,
    );
    try {
      registry.register(createGreeterFixtureDefinition());
    } catch (error) {
      expect(
        (error as ExtensionV2RegistrationError).diagnostics[0]?.code,
      ).toBe("duplicate-extension-id");
    }
  });

  it("rejects duplicate command ids", () => {
    const fixture = createGreeterFixtureDefinition();
    const error = expectCode(
      mutate(fixture, (draft) => {
        draft.commands.push({ ...draft.commands[0]! });
      }),
      "duplicate-command-id",
    );
    expect(error.diagnostics[0]?.message).toMatch("fixture-greeter.greet");
  });

  it("rejects duplicate setting and contribution ids", () => {
    const fixture = createGreeterFixtureDefinition();
    expectCode(
      mutate(fixture, (draft) => {
        draft.settings!.push({ ...draft.settings![0]! });
      }),
      "duplicate-setting-id",
    );
    expectCode(
      mutate(fixture, (draft) => {
        draft.contributions!.push({ ...draft.contributions![0]! });
      }),
      "duplicate-contribution-id",
    );
  });

  it("rejects command ids outside the extension namespace", () => {
    const fixture = createGreeterFixtureDefinition();
    const error = expectCode(
      mutate(fixture, (draft) => {
        draft.commands[0]!.id = "someone-else.greet";
      }),
      "unowned-command-id",
    );
    expect(error.diagnostics[0]?.message).toMatch("fixture-greeter.");
  });

  it("rejects setting and contribution ids outside the extension namespace", () => {
    const fixture = createGreeterFixtureDefinition();
    expectCode(
      mutate(fixture, (draft) => {
        draft.settings![0]!.id = "other.formality";
      }),
      "unowned-setting-id",
    );
    expectCode(
      mutate(fixture, (draft) => {
        draft.contributions![0]!.id = "other.palette-greet";
      }),
      "unowned-contribution-id",
    );
  });

  it("rejects malformed setting defaults", () => {
    const fixture = createGreeterFixtureDefinition();
    expectCode(
      mutate(fixture, (draft) => {
        draft.settings![0]!.defaultValue = "slang";
      }),
      "malformed-setting-default",
    );
    expectCode(
      mutate(fixture, (draft) => {
        draft.settings = [
          {
            id: "fixture-greeter.verbose",
            label: "Verbose",
            type: "boolean",
            defaultValue: "yes",
          },
        ];
      }),
      "malformed-setting-default",
    );
    expectCode(
      mutate(fixture, (draft) => {
        draft.settings = [
          {
            id: "fixture-greeter.retries",
            label: "Retries",
            type: "number",
            defaultValue: Number.NaN,
          },
        ];
      }),
      "malformed-setting-default",
    );
  });

  it("rejects enum settings without usable options", () => {
    const fixture = createGreeterFixtureDefinition();
    expectCode(
      mutate(fixture, (draft) => {
        draft.settings = [
          {
            id: "fixture-greeter.formality",
            label: "Formality",
            type: "enum",
            defaultValue: "casual",
            options: [],
          },
        ];
      }),
      "malformed-setting-options",
    );
  });

  it("rejects unsupported API versions with the supported set named", () => {
    const fixture = createGreeterFixtureDefinition();
    for (const apiVersion of [1, 99]) {
      const error = expectCode(
        mutate(fixture, (draft) => {
          draft.apiVersion = apiVersion;
        }),
        "unsupported-api-version",
      );
      expect(error.diagnostics[0]?.message).toMatch("2");
    }
  });

  it("rejects unresolved command references in contributions and lifecycle", () => {
    const fixture = createGreeterFixtureDefinition();
    expectCode(
      mutate(fixture, (draft) => {
        draft.contributions![0]!.commandId = "fixture-greeter.missing";
      }),
      "unresolved-command-ref",
    );
    expectCode(
      mutate(fixture, (draft) => {
        draft.lifecycle = {
          onEnabled: { commandId: "fixture-greeter.missing" },
        };
      }),
      "unresolved-command-ref",
    );
  });

  it("rejects unknown permissions", () => {
    const fixture = createGreeterFixtureDefinition();
    const error = expectCode(
      mutate(fixture, (draft) => {
        draft.permissions = ["library:read", "filesystem:root"] as unknown as (
          typeof draft.permissions
        );
      }),
      "unknown-permission",
    );
    expect(error.diagnostics[0]?.message).toMatch("filesystem:root");
  });

  it("rejects unsupported contribution types", () => {
    const fixture = createGreeterFixtureDefinition();
    const error = expectCode(
      mutate(fixture, (draft) => {
        draft.contributions![0]!.type =
          "floating-hologram" as unknown as ExtensionV2Contribution["type"];
      }),
      "unsupported-contribution-type",
    );
    expect(error.diagnostics[0]?.message).toMatch("floating-hologram");
  });

  it("rejects malformed input schemas", () => {
    const fixture = createGreeterFixtureDefinition();
    expectCode(
      mutate(fixture, (draft) => {
        draft.commands[0]!.input = { kind: "telepathy" } as unknown as (
          typeof draft.commands
        )[number]["input"];
      }),
      "malformed-schema",
    );
  });

  it("rejects malformed extension identity fields", () => {
    const fixture = createGreeterFixtureDefinition();
    expectCode(
      mutate(fixture, (draft) => {
        draft.id = "NOT A NAMESPACE";
      }),
      "malformed-extension-id",
    );
    expectCode(
      mutate(fixture, (draft) => {
        draft.version = "sometime-later";
      }),
      "malformed-extension-version",
    );
  });

  it("returns clones so callers cannot mutate registered state", () => {
    const registry = new ExtensionV2Registry();
    registry.register(createGreeterFixtureDefinition());
    const exposed = registry.get("fixture-greeter")!;
    exposed.commands[0]!.title = "Mutated";
    expect(registry.get("fixture-greeter")?.commands[0]?.title).toBe(
      "Greet selection",
    );
  });
});
