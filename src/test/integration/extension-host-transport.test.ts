import { existsSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  YardExtensionHost,
  YardExtensionRegistry,
  createYardUiIntent,
  type YardExtensionContext,
  type YardExtensionDefinition,
} from "@yard-core";
import {
  manifest as dropRulesManifest,
  registerCommands as registerDropRulesCommands,
} from "@foleyard/drop-rules";
import {
  manifest as folderJanitorManifest,
  registerCommands as registerFolderJanitorCommands,
} from "@foleyard/folder-janitor";
import {
  manifest as makePackManifest,
  registerCommands as registerMakePackCommands,
} from "@foleyard/make-pack";
import {
  manifest as libraryGathererManifest,
  registerCommands as registerLibraryGathererCommands,
} from "@foleyard/library-gatherer";
import {
  manifest as smartCollectionsManifest,
  registerCommands as registerSmartCollectionsCommands,
} from "@foleyard/smart-collections";
import {
  manifest as soundShelfManifest,
  registerCommands as registerSoundShelfCommands,
} from "@foleyard/sound-shelf";

import {
  audioFileRecord,
  callRoute,
  createScratchLibrary,
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
import { DbSoundShelfStore } from "@/lib/extensions/sound-shelf-store";
import { setExtensionSettingValue } from "@/lib/extensions/settings-store";
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
  it("holds every registered extension to its declared IDs, permissions and transport adapter", async () => {
    const expected = [
      {
        id: "drop-rules",
        manifest: dropRulesManifest,
        commands: [
          "drop-rules.open-settings",
          "drop-rules.preview",
          "drop-rules.apply",
          "drop-rules.prepare-drag",
        ],
        permissions: [
          "library:read",
          "files:read",
          "files:copy",
          "files:write",
          "drop:read",
          "drop:modify",
        ],
        adapted: ["drop-rules.prepare-drag", "drop-rules.preview", "drop-rules.apply"],
      },
      {
        id: "folder-janitor",
        manifest: folderJanitorManifest,
        commands: [
          "folder-janitor.scan-library",
          "folder-janitor.scan-folder",
          "folder-janitor.remove-files",
          "folder-janitor.delete-folders",
        ],
        permissions: ["library:read", "files:read", "files:write", "files:delete"],
        adapted: [
          "folder-janitor.scan-library",
          "folder-janitor.scan-folder",
          "folder-janitor.delete-folders",
        ],
      },
      {
        id: "make-pack",
        manifest: makePackManifest,
        commands: [
          "make-pack.from-selection",
          "make-pack.from-shelf",
          "make-pack.from-recent",
        ],
        permissions: ["library:read", "files:read", "files:copy", "files:write"],
        adapted: [
          "make-pack.from-selection",
          "make-pack.from-shelf",
          "make-pack.from-recent",
        ],
      },
      {
        id: "library-gatherer",
        manifest: libraryGathererManifest,
        commands: ["library-gatherer.preview-gather", "library-gatherer.gather"],
        permissions: [
          "library:read",
          "library:write",
          "files:read",
          "files:copy",
          "files:write",
        ],
        adapted: ["library-gatherer.preview-gather", "library-gatherer.gather"],
      },
      {
        id: "smart-collections",
        manifest: smartCollectionsManifest,
        commands: ["smart-collections.save-search"],
        permissions: ["collections:read", "collections:write", "library:read"],
        adapted: ["smart-collections.save-search"],
      },
      {
        id: "sound-shelf",
        manifest: soundShelfManifest,
        commands: [
          "sound-shelf.add-selected",
          "sound-shelf.remove-selected",
          "sound-shelf.clear",
          "sound-shelf.list",
        ],
        permissions: ["library:read"],
        adapted: ["sound-shelf.list"],
      },
    ];

    // The manifests the packages actually declare are the contract: an
    // extension that renames a command or widens its permissions fails here,
    // once, instead of once per consumer.
    const registered = new Map(
      extensionRegistry.listManifests().map((manifest) => [manifest.id, manifest]),
    );
    expect(registered.size).toBe(6);
    for (const extension of expected) {
      const manifest = registered.get(extension.id);
      expect(manifest, `${extension.id} is registered`).toBeDefined();
      expect(manifest!.commands.map((command) => command.id)).toEqual(
        extension.commands,
      );
      expect(manifest!.permissions).toEqual(extension.permissions);

      // Each declared command either owns a transport adapter, which rejects
      // an empty input with a controlled failure, or it passes straight
      // through to the host untouched. sound-shelf.list is the exception:
      // its adapter always resolves so it can shape whatever the store holds.
      for (const commandId of extension.commands) {
        const transport = await resolveCommandTransport({
          extensionId: extension.id,
          commandId,
          input: {},
        });
        if (commandId === "sound-shelf.list") {
          expect(transport.ok, `${commandId} always resolves`).toBe(true);
          if (transport.ok) {
            expect(typeof transport.shapeResult).toBe("function");
          }
        } else if (extension.adapted.includes(commandId)) {
          expect(transport.ok, `${commandId} owns an adapter`).toBe(false);
        } else {
          expect(transport, `${commandId} passes through`).toEqual({
            ok: true,
            inputProvided: false,
          });
        }
      }
    }

    // The registry surface the UI reads stays in step with the manifests.
    const grid = listRegisteredExtensionGridItems();
    expect(grid.map((item) => item.id).sort()).toEqual([
      "drop-rules",
      "folder-janitor",
      "library-gatherer",
      "make-pack",
      "smart-collections",
      "sound-shelf",
    ]);
    for (const item of grid) {
      expect(item.commandCount).toBe(
        expected.find((extension) => extension.id === item.id)!.commands.length,
      );
    }

    // The register functions behind the manifests are the ones the table pins.
    for (const register of [
      registerDropRulesCommands,
      registerFolderJanitorCommands,
      registerMakePackCommands,
      registerLibraryGathererCommands,
      registerSmartCollectionsCommands,
      registerSoundShelfCommands,
    ]) {
      expect(typeof register).toBe("function");
    }
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

  it.fails("reports a folder scan past the cap as incomplete rather than truncating silently (B06)", async () => {
    const scratch = createScratchLibrary("foleyard-ext-scan-");
    try {
      settings.setLibraryRoots([scratch.root]);
      files.batchUpsertFiles(
        Array.from({ length: 5001 }, (_, index) =>
          audioFileRecord({
            path: `/lib/loop-${index}.wav`,
            filename: `loop-${index}.wav`,
          }),
        ),
        NOW(),
      );
      sqlite.prepare("UPDATE files SET library_root = ?").run(scratch.root);
      sqlite.prepare("UPDATE files SET directory = NULL").run();

      const response = await postExecute({
        extensionId: "folder-janitor",
        commandId: "folder-janitor.scan-folder",
        input: { folderPath: scratch.root },
      });
      expect(response.status).toBe(200);
      const report = (response.body as { value: unknown }).value as {
        scannedFiles?: unknown;
        incomplete?: unknown;
        total?: unknown;
      };

      // 5,001 files are indexed; the scan must either see all of them or say
      // it did not. Today it returns 5,000 rows as if complete.
      expect(
        report.scannedFiles === 5001 ||
          report.incomplete === true ||
          report.total === 5001,
        `a capped scan must report incompleteness, got scannedFiles=${String(report.scannedFiles)}`,
      ).toBe(true);
    } finally {
      scratch.dispose();
    }
  });

  it("hydrates make-pack selections from the shelf and stages drag-out files", async () => {
    const scratch = createScratchLibrary("foleyard-ext-hydrate-");
    try {
      const kick = scratch.writeFile("library/kick.wav");
      const snare = scratch.writeFile("library/snare.wav");
      settings.setLibraryRoots([scratch.root]);
      const [kickRow, snareRow] = seed([kick, snare]);
      const grant = await scratch.grant("dest");

      // Shelf hydration resolves ids to readable files and skips stale ones.
      new DbSoundShelfStore().setFileIds([kickRow.id, snareRow.id, "stale-id"]);
      const packed = await postExecute({
        extensionId: "make-pack",
        commandId: "make-pack.from-shelf",
        input: {
          destinationDirectory: grant.path,
          packName: "test-pack",
        },
        destinationGrant: grant.grantToken,
      });
      expect(packed.status).toBe(200);
      expect(existsSync(`${grant.path}/test-pack/kick.wav`)).toBe(true);
      expect(existsSync(`${grant.path}/test-pack/snare.wav`)).toBe(true);

      // Nothing but stale ids is a 404, not an empty pack.
      new DbSoundShelfStore().setFileIds(["stale-id"]);
      const stale = await postExecute({
        extensionId: "make-pack",
        commandId: "make-pack.from-shelf",
        input: {
          destinationDirectory: grant.path,
          packName: "test-pack",
        },
        destinationGrant: grant.grantToken,
      });
      expect(stale.status).toBe(404);

      // Drag-out stages the file and remaps the result to the staged copy.
      setExtensionSettingValue("drop-rules", "drag-out-folder", scratch.root);
      const drag = await postExecute({
        extensionId: "drop-rules",
        commandId: "drop-rules.prepare-drag",
        input: { fileId: kickRow.id },
      });
      expect(drag.status).toBe(200);
      const dragged = (drag.body as { value: { file: { id: string; filename: string; path: string } } }).value.file;
      expect(dragged.id).toBe(kickRow.id);
      expect(existsSync(dragged.path)).toBe(true);

      // A file that is not indexed cannot be dragged out.
      const missing = await postExecute({
        extensionId: "drop-rules",
        commandId: "drop-rules.prepare-drag",
        input: { fileId: "missing-id" },
      });
      expect(missing.status).toBe(404);
    } finally {
      scratch.dispose();
    }
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
    // a string has a length, so it sails past any emptiness check.
    const mistyped = await postExecute({
      extensionId: "sound-shelf",
      commandId: "sound-shelf.add-selected",
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

  it("runs gather, janitor, collection and rule commands end to end through the execute route", async () => {
    const scratch = createScratchLibrary("foleyard-ext-commands-");
    try {
      const source = scratch.directory("source");
      const kick = scratch.writeFile("source/kick.wav");
      settings.setLibraryRoots([scratch.root]);
      seed([kick]);
      const grant = await scratch.grant("dest");

      // Gather previews without copying; the plan names its sources.
      const preview = await postExecute({
        extensionId: "library-gatherer",
        commandId: "library-gatherer.preview-gather",
        input: {
          sourceDirectories: [source],
          destinationDirectory: grant.path,
        },
        destinationGrant: grant.grantToken,
      });
      expect(preview.status).toBe(200);
      expect(
        (preview.body as { value: { files: unknown[] } }).value.files,
      ).toBeDefined();

      // A gather with no sources is refused before touching the disk.
      const noSources = await postExecute({
        extensionId: "library-gatherer",
        commandId: "library-gatherer.gather",
        input: { sourceDirectories: [], destinationDirectory: grant.path },
        destinationGrant: grant.grantToken,
      });
      expect(noSources.status).toBe(400);

      // The janitor scans the whole library from the index, and its input
      // schema rejects garbage before the service ever runs.
      const scan = await postExecute({
        extensionId: "folder-janitor",
        commandId: "folder-janitor.scan-library",
        input: {},
      });
      expect(scan.status).toBe(200);
      expect(
        (scan.body as { value: { scannedFiles: number } }).value.scannedFiles,
      ).toBe(1);

      // Commands without an adapter receive the raw body input, so their input
      // schema rejects garbage before the service ever runs.
      const badPreview = await postExecute({
        extensionId: "drop-rules",
        commandId: "drop-rules.preview",
        input: {},
      });
      expect(badPreview.status, "schema violations are 400s").toBe(400);

      // Removing files marks them removed in the index.
      const [row] = files.getFiles({ limit: 10 });
      const removed = await postExecute({
        extensionId: "folder-janitor",
        commandId: "folder-janitor.remove-files",
        selection: { fileIds: [row.id] },
      });
      expect(removed.status).toBe(200);
      expect(files.getFileById(row.id)?.removedAt).not.toBeNull();

      // Empty folders are deleted; the grant boundary still applies.
      const empty = scratch.directory("empty");
      const deleted = await postExecute({
        extensionId: "folder-janitor",
        commandId: "folder-janitor.delete-folders",
        input: { paths: [empty] },
      });
      expect(deleted.status).toBe(200);
      expect(existsSync(empty)).toBe(false);

      // Saving a search creates a smart collection and returns its id.
      const saved = await postExecute({
        extensionId: "smart-collections",
        commandId: "smart-collections.save-search",
        input: { name: "Kicks", query: "kick" },
      });
      expect(saved.status).toBe(200);
      const savedId = (saved.body as { value: { id: string } }).value.id;
      expect(
        collections.getAllCollections().find((c) => c.id === savedId)?.isSmart,
      ).toBeTruthy();

      const unnamed = await postExecute({
        extensionId: "smart-collections",
        commandId: "smart-collections.save-search",
        input: { name: "", query: "kick" },
      });
      expect(unnamed.status).toBe(400);

      // Rule preview is a dry run over a real file.
      const ruled = await postExecute({
        extensionId: "drop-rules",
        commandId: "drop-rules.preview",
        selection: { fileIds: [row.id] },
        input: {
          targetDirectory: grant.path,
          files: [{ id: row.id, filename: "kick.wav", path: kick }],
        },
      });
      expect(ruled.status).toBe(200);
      expect(
        (ruled.body as { value: { actions: unknown[] } }).value.actions,
      ).toBeDefined();
    } finally {
      scratch.dispose();
    }
  });

  it("keeps shelf, ui-intent and client behaviour: dedupe, prune, dispatch and error mapping", async () => {
    const [kickRow, snareRow] = seed(["/lib/kick.wav", "/lib/snare.wav"]);

    // Adding twice dedupes; removing and clearing report honestly.
    const add = await postExecute({
      extensionId: "sound-shelf",
      commandId: "sound-shelf.add-selected",
      selection: { fileIds: [kickRow.id, snareRow.id] },
    });
    expect(add.status).toBe(200);
    expect(add.body).toMatchObject({ value: { added: 2, remaining: 2 } });

    const reAdd = await postExecute({
      extensionId: "sound-shelf",
      commandId: "sound-shelf.add-selected",
      selection: { fileIds: [kickRow.id] },
    });
    expect(reAdd.body).toMatchObject({ value: { added: 0, remaining: 2 } });

    const unadd = await postExecute({
      extensionId: "sound-shelf",
      commandId: "sound-shelf.remove-selected",
      selection: { fileIds: [kickRow.id] },
    });
    expect(unadd.body).toMatchObject({ value: { removed: 1, remaining: 1 } });

    // Listing enriches from the index and prunes what is gone.
    const listed = await postExecute({
      extensionId: "sound-shelf",
      commandId: "sound-shelf.list",
    });
    expect(listed.status).toBe(200);
    expect(
      (listed.body as { value: { items: Array<{ id: string; filename: string }> } }).value.items.map(
        (item) => item.id,
      ),
    ).toEqual([snareRow.id]);

    files.markFileRemoved(snareRow.path, NOW());
    const pruned = await postExecute({
      extensionId: "sound-shelf",
      commandId: "sound-shelf.list",
    });
    expect(
      (pruned.body as { value: { items: unknown[] } }).value.items,
    ).toEqual([]);
    expect(new DbSoundShelfStore().getFileIds()).toEqual([]);

    const cleared = await postExecute({
      extensionId: "sound-shelf",
      commandId: "sound-shelf.clear",
    });
    expect(cleared.body).toMatchObject({ value: { remaining: 0 } });

    // A no-input command returns an intent the UI dispatches, not a value.
    const settingsIntent = await postExecute({
      extensionId: "drop-rules",
      commandId: "drop-rules.open-settings",
    });
    expect(settingsIntent.status).toBe(200);
    expect(settingsIntent.body).toMatchObject({
      ok: true,
      type: "ui-intent",
      intent: { type: "drop-rules.open-settings" },
    });

    const calls: Array<{ name: string; payload: unknown }> = [];
    const actions: ExtensionUiIntentActions = {
      openFolderJanitor: (payload) => {
        calls.push({ name: "openFolderJanitor", payload });
      },
      openLibraryGatherer: () => {
        calls.push({ name: "openLibraryGatherer", payload: undefined });
      },
      openMakePack: (payload) => {
        calls.push({ name: "openMakePack", payload });
      },
      openSettings: () => {
        calls.push({ name: "openSettings", payload: undefined });
      },
    };
    expect(
      interpretExtensionUiIntent(
        createYardUiIntent("make-pack.open", { source: "shelf", fileIds: [snareRow.id] }),
        actions,
      ),
    ).toBe(true);
    expect(calls).toEqual([
      { name: "openMakePack", payload: { source: "shelf", fileIds: [snareRow.id] } },
    ]);
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
