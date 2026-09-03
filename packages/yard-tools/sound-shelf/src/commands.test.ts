import { describe, expect, it } from "vitest";
import { YardExtensionHost, YardExtensionRegistry } from "yard-core";

import { registerCommands } from "./commands";
import { manifest } from "./manifest";
import { InMemorySoundShelfStore } from "./store";

describe("Sound Shelf commands", () => {
  function createHost(store: InMemorySoundShelfStore) {
    const registry = new YardExtensionRegistry();
    registry.register({
      manifest,
      registerCommands: (context) => registerCommands(context, store),
    });

    return new YardExtensionHost({
      registry,
      isEnabled: () => true,
      getSettingValue: (_extensionId, _settingId, defaultValue) => defaultValue,
    });
  }

  it("clears the supplied shelf store through the Extension host", async () => {
    const store = new InMemorySoundShelfStore();
    store.setFileIds(["kick.wav", "snare.wav"]);

    const host = createHost(store);

    await expect(
      host.execute({
        extensionId: "sound-shelf",
        commandId: "sound-shelf.clear",
      }),
    ).resolves.toEqual({
      ok: true,
      type: "value",
      value: { added: 0, removed: 2, remaining: 0 },
    });
    expect(store.getFileIds()).toEqual([]);
  });

  it("adds only new selected files", async () => {
    const store = new InMemorySoundShelfStore();
    store.setFileIds(["kick.wav"]);

    await expect(
      createHost(store).execute({
        extensionId: "sound-shelf",
        commandId: "sound-shelf.add-selected",
        selection: { fileIds: ["kick.wav", "snare.wav"] },
      }),
    ).resolves.toEqual({
      ok: true,
      type: "value",
      value: { added: 1, removed: 0, remaining: 2 },
    });
    expect(store.getFileIds()).toEqual(["kick.wav", "snare.wav"]);
  });

  it("rejects add when the selection is missing", async () => {
    await expect(
      createHost(new InMemorySoundShelfStore()).execute({
        extensionId: "sound-shelf",
        commandId: "sound-shelf.add-selected",
      }),
    ).resolves.toMatchObject({ ok: false, reason: "validation-failed" });
  });

  it("removes selected files", async () => {
    const store = new InMemorySoundShelfStore();
    store.setFileIds(["kick.wav", "snare.wav"]);

    await expect(
      createHost(store).execute({
        extensionId: "sound-shelf",
        commandId: "sound-shelf.remove-selected",
        selection: { fileIds: ["kick.wav"] },
      }),
    ).resolves.toEqual({
      ok: true,
      type: "value",
      value: { added: 0, removed: 1, remaining: 1 },
    });
    expect(store.getFileIds()).toEqual(["snare.wav"]);
  });

  it("reads shelf IDs", async () => {
    const store = new InMemorySoundShelfStore();
    store.setFileIds(["kick.wav", "snare.wav"]);

    await expect(
      createHost(store).execute({
        extensionId: "sound-shelf",
        commandId: "sound-shelf.list",
      }),
    ).resolves.toEqual({
      ok: true,
      type: "value",
      value: ["kick.wav", "snare.wav"],
    });
  });
});
