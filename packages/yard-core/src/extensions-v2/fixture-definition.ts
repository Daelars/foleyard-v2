import { V2_EXTENSION_API_VERSION } from "./version";
import type { ExtensionV2Definition } from "./definition";

/**
 * Development-only conformance fixture. It exercises the same
 * `ExtensionV2Registry.register` path the Make Pack v2 reference will use
 * in #171, with no fixture-ID branches anywhere in production code: the
 * registry never inspects this ID. Never enters production catalogs or
 * packaged builds.
 */
export function createGreeterFixtureDefinition(): ExtensionV2Definition {
  return {
    id: "fixture-greeter",
    name: "Fixture Greeter",
    version: "0.1.0",
    apiVersion: V2_EXTENSION_API_VERSION,
    description:
      "Conformance fixture proving a second extension registers through the production v2 path.",
    permissions: ["library:read"],
    commands: [
      {
        id: "fixture-greeter.greet",
        title: "Greet selection",
        description: "Greet audio files by name for conformance checks.",
        scope: "selection",
        requiresSelection: true,
        input: {
          kind: "object",
          properties: {
            name: { kind: "string", minLength: 1 },
            greeting: {
              kind: "enum",
              values: ["hello", "welcome"],
              default: "hello",
            },
          },
          required: ["name"],
        },
        result: {
          kind: "object",
          properties: {
            message: { kind: "string" },
          },
          required: ["message"],
        },
        docsId: "commands",
      },
    ],
    settings: [
      {
        id: "fixture-greeter.formality",
        label: "Formality",
        description: "Tone used by the greeting fixture.",
        type: "enum",
        defaultValue: "casual",
        options: [
          { label: "Casual", value: "casual" },
          { label: "Formal", value: "formal" },
        ],
      },
    ],
    contributions: [
      {
        id: "fixture-greeter.palette-greet",
        type: "command-palette",
        commandId: "fixture-greeter.greet",
        title: "Greet selection",
        order: 10,
      },
    ],
    docsRefs: [{ id: "commands", title: "Command authoring" }],
    lifecycle: {
      onEnabled: { commandId: "fixture-greeter.greet" },
    },
  };
}
