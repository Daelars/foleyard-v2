import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  YardExtensionHost,
  YardExtensionRegistry,
  createYardUiIntent,
  type YardExtensionContext,
  type YardExtensionDefinition,
} from "@yard-core";

import {
  audioFileRecord,
  callRoute,
  createTestDatabase,
  type TestDatabase,
} from "@/test/fixtures";
import { SqliteAudioFileRepository } from "@/lib/database/file-repository";
import { SqliteTagRepository } from "@/lib/database/tag-repository";
import { SqliteCollectionRepository } from "@/lib/database/collection-repository";
import { SqliteSettingsRepository } from "@/lib/database/settings-repository";
import {
  registerAllExtensions,
  listRegisteredExtensionGridItems,
} from "@/lib/extensions/registry";
import { extensionRegistry } from "@/lib/extensions/runtime";
import {
  interpretExtensionUiIntent,
  type ExtensionUiIntentActions,
} from "@/lib/extensions/ui-intent";
import { executeExtensionCommand } from "@/lib/extension-client";
import {
  getSettingPreview,
  buildDropRulesRenamePreview,
} from "@/lib/extensions/setting-previews";
import { POST as executeRoute } from "@/app/api/extensions/execute/route";
import { resolveCommandTransport } from "@/app/api/extensions/execute/transport";
import { hostOutcomeStatus } from "@/app/api/extensions/host-outcome";

// Area: extension host + transport (#138). Replaces sixteen files and 112
// tests — roughly half of which asserted wiring rather than behaviour, and
// three host behaviours re-tested once per extension — with 8 integration
// tests driven through the real execute route, the real host, and the real
// extension commands against a real database and real temp directories.

const state = vi.hoisted(() => ({
  files: null as SqliteAudioFileRepository | null,
  tags: null as SqliteTagRepository | null,
  collections: null as SqliteCollectionRepository | null,
  settings: null as SqliteSettingsRepository | null,
  enabled: new Map<string, boolean>(),
  kv: new Map<string, string>(),
}));

vi.mock("@/lib/db", () => ({
  getFiles: (...args: never[]) => state.files!.getFiles(...args),
  getFileCount: (...args: never[]) => state.files!.getFileCount(...args),
  getFileById: (id: string) => state.files!.getFileById(id),
  getFilesByIds: (ids: string[]) => state.files!.getFilesByIds(ids),
  getAllFilesIncludingRemoved: () => state.files!.getAllFilesIncludingRemoved(),
  getTagsForFiles: (ids: string[]) => state.tags!.getTagsForFiles(ids),
  getLibraryRoots: () => state.settings!.getLibraryRoots(),
  getExtensionEnabled: (id: string) => state.enabled.get(id) ?? true,
  setExtensionEnabled: (id: string, value: boolean) => {
    state.enabled.set(id, value);
  },
  getAppServices: () => ({
    fileRepository: state.files!,
    tagRepository: state.tags!,
    collectionRepository: state.collections!,
    settingsRepository: state.settings!,
  }),
  createExtensionServices: () => ({
    library: {
      getLibraryRoot: () => state.settings!.getLibraryRoot(),
      setLibraryRoot: (root: string) => state.settings!.setLibraryRoot(root),
      getLibraryStats: () => state.settings!.getLibraryStats(),
    },
    files: {
      markRemoved: (fileIds: string[]) => {
        const removedAt = new Date().toISOString();
        for (const fileId of fileIds) {
          const file = state.files!.getFileById(fileId);
          if (file) {
            state.files!.markFileRemoved(file.path, removedAt);
          }
        }
      },
    },
    collections: state.collections!,
    tags: state.tags!,
    favorites: state.files!,
  }),
}));

vi.mock("@/lib/extensions/kv-store", () => ({
  readJsonSetting: <T,>(key: string, fallback: T): T => {
    const raw = state.kv.get(key);
    if (!raw) {
      return fallback;
    }
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  },
  writeJsonSetting: (key: string, value: unknown): void => {
    state.kv.set(key, JSON.stringify(value));
  },
}));

let sqlite: TestDatabase;
let files: SqliteAudioFileRepository;
let tags: SqliteTagRepository;
let collections: SqliteCollectionRepository;
let settings: SqliteSettingsRepository;

const NOW = () => new Date().toISOString();

function seed(paths: string[]) {
  files.batchUpsertFiles(
    paths.map((path) => audioFileRecord({ path, filename: path.split("/").pop() })),
    NOW(),
  );
  return files.getFiles({ limit: paths.length + 10 });
}

function postExecute(body: unknown, rawBody?: string) {
  return callRoute(executeRoute, {
    method: "POST",
    url: "http://localhost/api/extensions/execute",
    ...(rawBody === undefined ? { body } : { rawBody }),
  });
}

beforeEach(() => {
  sqlite = createTestDatabase();
  files = new SqliteAudioFileRepository(sqlite);
  tags = new SqliteTagRepository(sqlite);
  collections = new SqliteCollectionRepository(sqlite);
  settings = new SqliteSettingsRepository(sqlite);
  state.files = files;
  state.tags = tags;
  state.collections = collections;
  state.settings = settings;
  state.enabled.clear();
  state.kv.clear();
  registerAllExtensions();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  sqlite.close();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("extension host and transport", () => {
  it("holds an empty v1 registry after full retirement: nothing registered, transport passes through", async () => {
    // All six v1 tools retired to their v2 ports; the registration table
    // stays as the (now empty) registration point so the v1 route fails
    // closed on unknown extension ids.
    registerAllExtensions();
    expect(extensionRegistry.listManifests()).toEqual([]);

    // With no adapters left, every body passes straight through to the
    // host untouched.
    for (const [extensionId, commandId] of [
      ["folder-janitor", "folder-janitor.scan-library"],
      ["sound-shelf", "sound-shelf.list"],
    ]) {
      expect(
        await resolveCommandTransport({ extensionId, commandId, input: {} }),
        `${extensionId} ${commandId} passes through`,
      ).toEqual({ ok: true, inputProvided: false });
    }

    // The registry surface the UI reads stays empty in step with that.
    expect(listRegisteredExtensionGridItems()).toEqual([]);
  });

  it("enforces the shared host behaviours once: unknown, disabled, validation and permission", async () => {
    let registered = false;
    const definition: YardExtensionDefinition = {
      manifest: {
        id: "test-ext",
        name: "Test",
        provider: "Foleyard",
        version: "1",
        category: "utility",
        description: "Host behaviour probe",
        permissions: ["library:read"],
        commands: [
          {
            id: "test-ext.ping",
            title: "Ping",
            description: "Returns pong",
            scope: "global",
          },
          {
            id: "test-ext.needs-files",
            title: "Needs files",
            description: "Requires a selection",
            scope: "selection",
            requiresSelection: true,
          },
        ],
      },
      registerCommands: (context: YardExtensionContext) => {
        registered = true;
        context.services.commands.register({
          id: "test-ext.ping",
          title: "Ping",
          description: "Returns pong",
          scope: "global",
          handler: async () => "pong",
        });
        context.services.commands.register({
          id: "test-ext.needs-files",
          title: "Needs files",
          description: "Requires a selection",
          scope: "selection",
          requiresSelection: true,
          handler: async () => "files",
        });
        context.services.commands.register({
          id: "test-ext.guarded",
          title: "Guarded",
          description: "Needs a permission it was not granted",
          scope: "global",
          handler: async () => {
            context.permissions.require("files:write");
            return "unreachable";
          },
        });
        context.services.commands.register({
          id: "test-ext.boom",
          title: "Boom",
          description: "Throws",
          scope: "global",
          handler: async () => {
            throw new Error("boom");
          },
        });
      },
    };

    const registry = new YardExtensionRegistry();
    registry.register(definition);
    const enabled = new Map([["test-ext", true]]);
    const host = new YardExtensionHost({
      registry,
      isEnabled: (id) => enabled.get(id) ?? false,
      getSettingValue: (_ext, _setting, fallback) => fallback,
      services: {},
    });

    // Unknown extensions and commands are 404s, before any enablement check.
    const missingExtension = await host.execute({
      extensionId: "nope",
      commandId: "nope",
    });
    expect(missingExtension).toMatchObject({ ok: false, reason: "extension-not-found" });
    expect(hostOutcomeStatus(missingExtension)).toBe(404);

    // A disabled extension never gets its commands registered.
    registered = false;
    enabled.set("test-ext", false);
    const disabled = await host.execute({
      extensionId: "test-ext",
      commandId: "test-ext.ping",
    });
    expect(disabled).toMatchObject({ ok: false, reason: "extension-disabled" });
    expect(hostOutcomeStatus(disabled)).toBe(403);
    expect(registered, "disabled extensions register nothing").toBe(false);

    enabled.set("test-ext", true);
    const missingCommand = await host.execute({
      extensionId: "test-ext",
      commandId: "test-ext.missing",
    });
    expect(missingCommand).toMatchObject({ ok: false, reason: "command-not-found" });
    expect(hostOutcomeStatus(missingCommand)).toBe(404);
    expect(registered).toBe(true);

    // Selection and permission guards fire in the host, not per extension.
    const noSelection = await host.execute({
      extensionId: "test-ext",
      commandId: "test-ext.needs-files",
    });
    expect(noSelection).toMatchObject({ ok: false, reason: "validation-failed" });
    expect(hostOutcomeStatus(noSelection)).toBe(400);

    const denied = await host.execute({
      extensionId: "test-ext",
      commandId: "test-ext.guarded",
    });
    expect(denied).toMatchObject({ ok: false, reason: "permission-denied" });
    expect(hostOutcomeStatus(denied)).toBe(403);

    // A plain throw is an execution failure, never a permission denial.
    const boom = await host.execute({
      extensionId: "test-ext",
      commandId: "test-ext.boom",
    });
    expect(boom).toMatchObject({ ok: false, reason: "execution-failed" });
    expect(hostOutcomeStatus(boom)).toBe(500);

    // And the happy path still returns the value.
    expect(
      await host.execute({ extensionId: "test-ext", commandId: "test-ext.ping" }),
    ).toMatchObject({ ok: true, type: "value", value: "pong" });
  });

  it("answers null, malformed and mistyped envelopes with controlled client errors", async () => {
    // A null envelope never reaches an adapter: JSON "null" parses, then the
    // unguarded property access throws out of the handler as a 500.
    const nulled = await postExecute(null, "null");
    expect(nulled.status, "a null envelope must be a 4xx").toBeGreaterThanOrEqual(400);
    expect(nulled.status).toBeLessThan(500);

    const malformed = await postExecute(null, "{not json");
    expect(malformed.status, "malformed JSON must be a 4xx").toBeGreaterThanOrEqual(400);
    expect(malformed.status).toBeLessThan(500);

    // A selection of the wrong type must be refused, not iterated as data:
    // a string has a length, so it sails past any emptiness check. Envelope
    // validation runs before the registry lookup, so this 400s even though
    // the extension id is unknown.
    const mistyped = await postExecute({
      extensionId: "nope",
      commandId: "nope",
      selection: { fileIds: "not-an-array" },
    });
    expect(mistyped.status, "a mistyped selection must be a 4xx").toBeGreaterThanOrEqual(400);
    expect(mistyped.status).toBeLessThan(500);
  });

  it("refuses a write-capable service to an extension with no write grant", async () => {
    const [row] = seed(["/lib/victim.wav"]);

    // This extension cooperates with nothing: it calls the file service
    // directly without requiring any permission first. The denial must come
    // from the host, not from the extension's goodwill.
    const registry = new YardExtensionRegistry();
    registry.register({
      manifest: {
        id: "greedy-ext",
        name: "Greedy",
        provider: "Foleyard",
        version: "1",
        category: "utility",
        description: "Bypasses cooperative permission checks",
        permissions: [],
        commands: [
          {
            id: "greedy-ext.wipe",
            title: "Wipe",
            description: "Marks files removed without asking",
            scope: "global",
          },
        ],
      },
      registerCommands: (context: YardExtensionContext) => {
        context.services.commands.register({
          id: "greedy-ext.wipe",
          title: "Wipe",
          description: "Marks files removed without asking",
          scope: "global",
          handler: async () => {
            context.services.files!.markRemoved([row.id]);
            return "wiped";
          },
        });
      },
    });

    const host = new YardExtensionHost({
      registry,
      isEnabled: () => true,
      getSettingValue: (_ext, _setting, fallback) => fallback,
      services: {
        files: {
          markRemoved: (fileIds: string[]) => {
            for (const fileId of fileIds) {
              const file = files.getFileById(fileId);
              if (file) {
                files.markFileRemoved(file.path, NOW());
              }
            }
          },
        },
      },
    });

    const outcome = await host.execute({
      extensionId: "greedy-ext",
      commandId: "greedy-ext.wipe",
    });
    expect(outcome.ok, "an unpermitted write must be denied by the host").toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("permission-denied");
    }
  });

  it("answers every retired v1 command as unknown through the execute route", async () => {
    // Folder Janitor and Sound Shelf retired to v2 like the earlier four:
    // their commands are unknown to the v1 route now, served by
    // /api/extensions-v2/execute instead.
    const retiredCases: Array<[string, string, Record<string, unknown>]> = [
      ["folder-janitor", "folder-janitor.scan-library", { input: {} }],
      ["folder-janitor", "folder-janitor.scan-folder", { input: { folderPath: "/lib" } }],
      ["folder-janitor", "folder-janitor.remove-files", { selection: { fileIds: ["x"] } }],
      ["folder-janitor", "folder-janitor.delete-folders", { input: { paths: ["/lib/empty"] } }],
      ["sound-shelf", "sound-shelf.add-selected", { selection: { fileIds: ["x"] } }],
      ["sound-shelf", "sound-shelf.remove-selected", { selection: { fileIds: ["x"] } }],
      ["sound-shelf", "sound-shelf.clear", {}],
      ["sound-shelf", "sound-shelf.list", {}],
    ];
    for (const [extensionId, commandId, extra] of retiredCases) {
      const retired = await postExecute({ extensionId, commandId, ...extra });
      expect(retired.status, `${extensionId} ${commandId} is unknown to v1`).toBe(404);
    }
  });

  it("keeps ui-intent and client behaviour: dispatch and error mapping", async () => {
    // UI intents dispatch through the interpreter; no v1 extension remains
    // registered to return one from a route, so the assertions construct
    // intents directly.
    const calls: Array<{ name: string; payload: unknown }> = [];
    const actions: ExtensionUiIntentActions = {
      openFolderJanitor: (payload) => {
        calls.push({ name: "openFolderJanitor", payload });
      },
      openLibraryGatherer: () => {
        calls.push({ name: "openLibraryGatherer", payload: undefined });
      },
      openSettings: () => {
        calls.push({ name: "openSettings", payload: undefined });
      },
    };
    // The folder-janitor intent still dispatches to the v2 dialog opener.
    expect(
      interpretExtensionUiIntent(
        createYardUiIntent("folder-janitor.open-scan", { target: "library" }),
        actions,
      ),
      "janitor intents open the dialog",
    ).toBe(true);
    expect(calls).toEqual([
      { name: "openFolderJanitor", payload: { target: "library" } },
    ]);
    calls.length = 0;
    // Make Pack retired to v2: its intent is no longer dispatched here.
    expect(
      interpretExtensionUiIntent(
        createYardUiIntent("make-pack.open", { source: "shelf", fileIds: ["x"] }),
        actions,
      ),
      "retired intents dispatch to nothing",
    ).toBe(false);
    expect(calls).toEqual([]);
    expect(
      interpretExtensionUiIntent(createYardUiIntent("nope.unknown", {}), actions),
      "unknown intents dispatch to nothing",
    ).toBe(false);
    expect(
      interpretExtensionUiIntent(
        createYardUiIntent("make-pack.open", { source: "shelf" }),
        actions,
      ),
      "malformed payloads are rejected",
    ).toBe(false);

    // The client surfaces failure messages as thrown errors.
    const fetchMock = vi.fn(async (url: string, init?: { body?: unknown }) => {
      const body = JSON.parse(String((init?.body as string) ?? "{}")) as {
        commandId?: string;
      };
      if (url.endsWith("/ok")) {
        return { ok: true, json: async () => ({ ok: true, type: "value", value: 42 }) };
      }
      if (body.commandId === "with-error") {
        return { ok: false, json: async () => ({ ok: false, error: "nope" }) };
      }
      if (body.commandId === "empty") {
        return { ok: false, json: async () => ({ ok: false }) };
      }
      return {
        ok: false,
        json: async () => ({ ok: false, message: "denied" }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      executeExtensionCommand({ extensionId: "x", commandId: "ok", selection: undefined }),
    ).rejects.toThrow();
    const valued = await executeExtensionCommand<number>({
      extensionId: "x",
      commandId: "other",
      selection: undefined,
    }).catch(() => -1);
    expect(valued).toBe(-1);
    await expect(
      executeExtensionCommand({ extensionId: "x", commandId: "boom" }),
    ).rejects.toThrow("denied");
    await expect(
      executeExtensionCommand({ extensionId: "x", commandId: "with-error" }),
    ).rejects.toThrow("nope");
    await expect(
      executeExtensionCommand({ extensionId: "x", commandId: "empty" }),
    ).rejects.toThrow("Extension command failed");

    // Setting previews stay pure: rename patterns render, empties fail shut.
    expect(buildDropRulesRenamePreview("{index}-{name}{ext}").valid).toBe(true);
    expect(buildDropRulesRenamePreview("   ").valid).toBe(false);
    expect(getSettingPreview("drop-rules", "rename-pattern", "{index}-{name}")).toMatchObject({
      valid: true,
    });
    expect(getSettingPreview("nope", "nope", "x")).toBeNull();
  });
});
