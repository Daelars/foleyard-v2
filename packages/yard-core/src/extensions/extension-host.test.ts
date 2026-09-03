import { describe, expect, it } from "vitest";

import { YardExtensionHost } from "./extension-host";
import { YardExtensionRegistry } from "./extension-registry";
import { createYardUiIntent } from "./extension-ui-intent";

function createRegistry(
  handler: Parameters<YardExtensionRegistry["register"]>[0]["registerCommands"] =
    (context) => {
      context.services.commands.register({
        id: "example.run",
        title: "Run Example",
        description: "Runs the example command.",
        scope: "global",
        handler: () => context.services.settings?.get("mode"),
      });
    },
) {
  const registry = new YardExtensionRegistry();

  registry.register({
    manifest: {
      id: "example",
      name: "Example",
      provider: "Foleyard",
      version: "1.0.0",
      description: "Exercises the Extension host.",
      category: "utility",
      permissions: ["library:read"],
      commands: [
        {
          id: "example.run",
          title: "Run Example",
          description: "Runs the example command.",
          scope: "global",
        },
      ],
      settings: [
        {
          id: "mode",
          label: "Mode",
          type: "string",
          defaultValue: "default",
        },
      ],
    },
    registerCommands: handler,
  });

  return registry;
}

describe("YardExtensionHost", () => {
  it("executes a registered command with resolved Extension settings", async () => {
    const host = new YardExtensionHost({
      registry: createRegistry(),
      isEnabled: () => true,
      getSettingValue: (_extensionId, settingId, defaultValue) =>
        settingId === "mode" ? "custom" : defaultValue,
    });

    await expect(
      host.execute({ extensionId: "example", commandId: "example.run" }),
    ).resolves.toEqual({ ok: true, type: "value", value: "custom" });
  });

  it("distinguishes a UI intent from a direct value", async () => {
    const host = new YardExtensionHost({
      registry: createRegistry((context) => {
        context.services.commands.register({
          id: "example.run",
          title: "Run Example",
          description: "Runs the example command.",
          scope: "global",
          handler: () =>
            createYardUiIntent("example.open", { target: "library" }),
        });
      }),
      isEnabled: () => true,
      getSettingValue: (_extensionId, _settingId, defaultValue) => defaultValue,
    });

    await expect(
      host.execute({ extensionId: "example", commandId: "example.run" }),
    ).resolves.toEqual({
      ok: true,
      type: "ui-intent",
      intent: {
        kind: "yard-ui-intent",
        type: "example.open",
        payload: { target: "library" },
      },
    });
  });

  it("reports an unknown extension without checking enablement", async () => {
    let checkedEnablement = false;
    const host = new YardExtensionHost({
      registry: new YardExtensionRegistry(),
      isEnabled: () => {
        checkedEnablement = true;
        return true;
      },
      getSettingValue: (_extensionId, _settingId, defaultValue) => defaultValue,
    });

    await expect(
      host.execute({ extensionId: "missing", commandId: "missing.run" }),
    ).resolves.toMatchObject({ ok: false, reason: "extension-not-found" });
    expect(checkedEnablement).toBe(false);
  });

  it("does not register commands for a disabled extension", async () => {
    let registered = false;
    const host = new YardExtensionHost({
      registry: createRegistry(() => {
        registered = true;
      }),
      isEnabled: () => false,
      getSettingValue: (_extensionId, _settingId, defaultValue) => defaultValue,
    });

    await expect(
      host.execute({ extensionId: "example", commandId: "example.run" }),
    ).resolves.toMatchObject({ ok: false, reason: "extension-disabled" });
    expect(registered).toBe(false);
  });

  it("reports a command that the extension did not register", async () => {
    const host = new YardExtensionHost({
      registry: createRegistry(() => undefined),
      isEnabled: () => true,
      getSettingValue: (_extensionId, _settingId, defaultValue) => defaultValue,
    });

    await expect(
      host.execute({ extensionId: "example", commandId: "example.missing" }),
    ).resolves.toMatchObject({ ok: false, reason: "command-not-found" });
  });

  it("rejects a selection command when no files are selected", async () => {
    const host = new YardExtensionHost({
      registry: createRegistry((context) => {
        context.services.commands.register({
          id: "example.run",
          title: "Run Example",
          description: "Runs the example command.",
          scope: "selection",
          requiresSelection: true,
          handler: () => "should not run",
        });
      }),
      isEnabled: () => true,
      getSettingValue: (_extensionId, _settingId, defaultValue) => defaultValue,
    });

    await expect(
      host.execute({ extensionId: "example", commandId: "example.run" }),
    ).resolves.toMatchObject({ ok: false, reason: "validation-failed" });
  });

  it("reports permission failures from command execution", async () => {
    const host = new YardExtensionHost({
      registry: createRegistry((context) => {
        context.services.commands.register({
          id: "example.run",
          title: "Run Example",
          description: "Runs the example command.",
          scope: "global",
          handler: () => context.permissions.require("library:write"),
        });
      }),
      isEnabled: () => true,
      getSettingValue: (_extensionId, _settingId, defaultValue) => defaultValue,
    });

    await expect(
      host.execute({ extensionId: "example", commandId: "example.run" }),
    ).resolves.toMatchObject({ ok: false, reason: "permission-denied" });
  });

  it("does not mistake an ordinary command error for a permission failure", async () => {
    const host = new YardExtensionHost({
      registry: createRegistry((context) => {
        context.services.commands.register({
          id: "example.run",
          title: "Run Example",
          description: "Runs the example command.",
          scope: "global",
          handler: () => {
            throw new Error('Missing required permission "library:write".');
          },
        });
      }),
      isEnabled: () => true,
      getSettingValue: (_extensionId, _settingId, defaultValue) => defaultValue,
    });

    await expect(
      host.execute({ extensionId: "example", commandId: "example.run" }),
    ).resolves.toMatchObject({ ok: false, reason: "execution-failed" });
  });
});
