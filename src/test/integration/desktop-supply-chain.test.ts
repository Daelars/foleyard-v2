import { createRequire } from "node:module";
import { Module } from "node:module";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import https from "node:https";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fileTableGridClass, FILE_TABLE_GRID_DEFAULT } from "@/components/FileTable/layout";
import {
  getDesktopServerSnapshot,
  getDesktopSnapshot,
  notifyDesktopBridgeChanged,
  subscribeDesktopBridge,
  useDesktopApp,
} from "@/lib/desktop";
import { registerGrant, resolveGrantedExistingPath } from "@/lib/filesystem-boundary";
import { GET as desktopFileGET } from "@/app/api/desktop/file/route";
import { POST as desktopPathPOST } from "@/app/api/desktop/path/route";
import { POST as desktopGrantsPOST } from "@/app/api/desktop/grants/route";

// Area: desktop + supply chain (#141). A consolidation, not a cleanup: the
// 41 tests here are good and none is filler, so all of their assertions
// survive — grouped into 5 integration tests instead of 7 files.

const cjsRequire = createRequire(import.meta.url);

type LoadFn = (this: unknown, request: string, ...rest: unknown[]) => unknown;
const ModuleWithLoad = Module as unknown as { _load: LoadFn };
const originalLoad = ModuleWithLoad._load;

type MockFn = ReturnType<typeof vi.fn>;
type IpcHandler = (...args: Array<unknown>) => unknown;

interface FakeElectron {
  app: { isPackaged: boolean; getPath: (name: string) => string; getAppPath: () => string; exit: MockFn };
  dialog: { showErrorBox: MockFn };
  ipcMain: {
    onChannels: string[];
    handleChannels: string[];
    handlers: Record<string, IpcHandler>;
    on: MockFn;
    handle: MockFn;
  };
  clipboard: { writeText: MockFn };
  nativeImage: { createFromBuffer: MockFn };
  shell: { showItemInFolder: MockFn; openPath: MockFn };
}

let electronFake: FakeElectron;
let loadStubs: Record<string, unknown>;

function installLoadInterception() {
  ModuleWithLoad._load = function (request: string, ...rest: unknown[]) {
    if (request === "electron") return electronFake;
    if (Object.hasOwn(loadStubs, request)) {
      const stub = loadStubs[request];
      if (stub instanceof Error) throw stub;
      return stub;
    }
    return originalLoad.call(this, request, ...rest);
  };
}

function restoreLoadInterception() {
  ModuleWithLoad._load = originalLoad;
}

function dropElectronModulesFromCache() {
  for (const key of Object.keys(cjsRequire.cache)) {
    if (key.includes(`electron${path.sep}main`)) delete cjsRequire.cache[key];
  }
}

function requireElectronMain<T>(relativePath: string): T {
  return cjsRequire(`../../../electron/main/${relativePath}`) as T;
}

function buildElectronFake(userDataDir: string): FakeElectron {
  const handlers: Record<string, IpcHandler> = {};
  const onChannels: string[] = [];
  const handleChannels: string[] = [];
  return {
    app: {
      isPackaged: false,
      getPath: () => userDataDir,
      getAppPath: () => process.cwd(),
      exit: vi.fn(),
    },
    dialog: { showErrorBox: vi.fn() },
    ipcMain: {
      onChannels,
      handleChannels,
      handlers,
      on: vi.fn((channel: string) => {
        onChannels.push(channel);
      }),
      handle: vi.fn((channel: string, listener: IpcHandler) => {
        handleChannels.push(channel);
        handlers[channel] = listener;
      }),
    },
    clipboard: { writeText: vi.fn() },
    nativeImage: { createFromBuffer: vi.fn(() => ({})) },
    shell: { showItemInFolder: vi.fn(), openPath: vi.fn() },
  };
}

const dbMocks = vi.hoisted(() => ({
  roots: [] as string[],
  files: new Map<string, { id: string; filename: string; path: string; removedAt: string | null }>(),
}));

vi.mock("@/lib/db", () => ({
  getFileById: (id: string) => dbMocks.files.get(id),
  getLibraryRoots: () => dbMocks.roots,
}));

const { downloadWithRedirects, verifyDigest } = cjsRequire(
  "../../../scripts/postinstall.cjs",
) as {
  downloadWithRedirects(url: string): Promise<Buffer>;
  verifyDigest(buffer: Buffer, digest: string): void;
};

const PACKAGED_HANDLERS = [
  "desktop:copy-file-path",
  "desktop:pick-folder",
  "desktop:reveal-in-explorer",
  "desktop:reveal-path",
  "desktop:open-file-externally",
  "desktop:window-minimize",
  "desktop:window-toggle-maximize",
  "desktop:window-close",
  "desktop:get-window-state",
  "desktop:check-for-updates",
  "desktop:install-update",
];

function Probe() {
  const desktop = useDesktopApp();
  return createElement("div", {
    "data-desktop": String(desktop),
    className: fileTableGridClass(desktop),
  });
}

beforeEach(() => {
  loadStubs = {
    "electron-updater": {
      autoUpdater: {
        autoDownload: false,
        autoInstallOnAppQuit: false,
        checkForUpdates: vi.fn(),
        quitAndInstall: vi.fn(),
        on: vi.fn(),
      },
    },
  };
  electronFake = buildElectronFake(fs.mkdtempSync(path.join(os.tmpdir(), "foleyard-dt-")));
  installLoadInterception();
  dropElectronModulesFromCache();
});

afterEach(() => {
  restoreLoadInterception();
  dropElectronModulesFromCache();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  (globalThis as unknown as { window?: unknown }).window = undefined;
});

describe("desktop and supply chain", () => {
  it("registers exactly the intended IPC surface, and only the dev build gets the simulator", async () => {
    for (const packaged of [true, false]) {
      electronFake.app.isPackaged = packaged;
      electronFake.ipcMain.onChannels.length = 0;
      electronFake.ipcMain.handleChannels.length = 0;
      for (const key of Object.keys(electronFake.ipcMain.handlers)) {
        delete electronFake.ipcMain.handlers[key];
      }
      dropElectronModulesFromCache();
      const ipc = requireElectronMain<{ registerIpcHandlers: () => void }>("ipc.cjs");
      ipc.registerIpcHandlers();

      // The whole surface at once: one event channel, the handle table, and
      // nothing else — a stray handler fails here rather than hiding.
      expect(electronFake.ipcMain.onChannels).toEqual(["desktop:start-drag-file"]);
      expect([...electronFake.ipcMain.handleChannels].sort()).toEqual(
        [...PACKAGED_HANDLERS, ...(packaged ? [] : ["desktop:simulate-update"])].sort(),
      );

      // The simulator only exists in development, wired and emitting.
      const autoUpdater = requireElectronMain<{
        setUpdateWindow: (window: unknown) => void;
        simulateUpdate: () => void;
      }>("auto-updater.cjs");
      const sends: unknown[][] = [];
      autoUpdater.setUpdateWindow({
        isDestroyed: () => false,
        webContents: { send: (channel: unknown, ...payload: unknown[]) => sends.push([channel, ...payload]) },
      });
      try {
        if (packaged) {
          expect(electronFake.ipcMain.handlers["desktop:simulate-update"]).toBeUndefined();
          autoUpdater.simulateUpdate();
          expect(sends).toHaveLength(0);
        } else {
          const simulate = electronFake.ipcMain.handlers["desktop:simulate-update"];
          expect(simulate).toBeDefined();
          await simulate();
          expect(sends[0]?.[0]).toBe("desktop:update-available");
        }
      } finally {
        autoUpdater.setUpdateWindow(null);
      }
    }
  });

  it("refuses to start broken and reports errors loudly but once", async () => {
    const adapter = requireElectronMain<{
      SUPPORTED_NEXT_MAJOR: number;
      assertSupportedNextVersion: () => string;
      loadPrivateStartServer: () => unknown;
      startProductionServer: (options: unknown) => Promise<unknown>;
      allocateLoopbackPort: (host: string) => Promise<number>;
      assertServerStarted: (port: number) => void;
    }>("next-server-adapter.cjs");

    // The installed Next.js major is accepted; anything else fails loud.
    expect(adapter.SUPPORTED_NEXT_MAJOR).toBe(16);
    expect(adapter.assertSupportedNextVersion()).toMatch(/^16\./);
    loadStubs["next/package.json"] = { version: "99.0.0" };
    expect(() => adapter.assertSupportedNextVersion()).toThrowError(
      /Foleyard desktop cannot start.*supports Next\.js v16.*99\.0\.0.*next-server-adapter\.cjs/,
    );
    loadStubs["next/package.json"] = Object.assign(
      new Error("Cannot find module 'next/package.json'"),
      { code: "MODULE_NOT_FOUND" },
    );
    expect(() => adapter.assertSupportedNextVersion()).toThrowError(
      /Foleyard desktop cannot start.*installed version is unknown/,
    );
    loadStubs["next/dist/server/lib/start-server"] = Object.assign(
      new Error("Cannot find module 'next/dist/server/lib/start-server'"),
      { code: "MODULE_NOT_FOUND" },
    );
    expect(() => adapter.loadPrivateStartServer()).toThrowError(
      /Foleyard desktop cannot start.*private module "next\/dist\/server\/lib\/start-server".*upgrade probably moved it/,
    );
    await expect(
      adapter.startProductionServer({ dir: process.cwd(), hostname: "127.0.0.1" }),
    ).rejects.toThrow(/Foleyard desktop cannot start/);

    // Loopback ports allocate usable and startup validates.
    const port = await adapter.allocateLoopbackPort("127.0.0.1");
    expect(Number.isInteger(port)).toBe(true);
    expect(port).toBeGreaterThan(0);
    expect(port).toBeLessThan(65536);
    expect(() => adapter.assertServerStarted(port)).not.toThrow();
    expect(() => adapter.assertServerStarted(0)).toThrowError(/Foleyard desktop failed to start/);

    // Errors log every time, dialog at most once, forward to the renderer,
    // and terminate only when fatal.
    dropElectronModulesFromCache();
    const errors = requireElectronMain<{
      resetMainProcessErrorState: () => void;
      reportMainProcessError: (error: unknown, options?: unknown) => void;
      setMainWindow: (window: unknown) => void;
    }>("errors.cjs");
    const readLog = () =>
      fs.existsSync(path.join(electronFake.app.getPath("userData"), "desktop-errors.log"))
        ? fs.readFileSync(path.join(electronFake.app.getPath("userData"), "desktop-errors.log"), "utf8")
        : "";
    errors.resetMainProcessErrorState();
    errors.reportMainProcessError(new Error("first boom"));
    errors.reportMainProcessError(new Error("second boom"));
    expect(electronFake.dialog.showErrorBox).toHaveBeenCalledTimes(1);
    expect(readLog()).toContain("first boom");
    expect(readLog()).toContain("second boom");

    const send = vi.fn();
    errors.setMainWindow({ isDestroyed: () => false, webContents: { send } });
    errors.reportMainProcessError(new Error("renderer ping"), { dialog: false });
    expect(send).toHaveBeenCalledWith(
      "desktop:action-error",
      expect.stringContaining("renderer ping"),
    );
    errors.setMainWindow(null);

    errors.reportMainProcessError(new Error("recoverable"), { dialog: false });
    expect(electronFake.app.exit).not.toHaveBeenCalled();
    errors.reportMainProcessError(new Error("fatal"), { dialog: false, fatal: true });
    expect(electronFake.app.exit).toHaveBeenCalledWith(1);
  });

  it("holds the runtime policy: server origin, build metadata, grants and bridge", async () => {
    // The renderer belongs to the server that owns its window: origin only.
    const { DEV_SERVER_URL } = requireElectronMain<{ DEV_SERVER_URL: string }>("constants.cjs");
    const { getDesktopServerUrl, setDesktopServerUrl } = requireElectronMain<{
      getDesktopServerUrl: () => string;
      setDesktopServerUrl: (startUrl: string) => void;
    }>("server-url.cjs");
    try {
      setDesktopServerUrl("http://127.0.0.1:49152/library?view=all");
      expect(getDesktopServerUrl()).toBe("http://127.0.0.1:49152");
    } finally {
      setDesktopServerUrl(DEV_SERVER_URL);
    }

    // Disposable data and DevTools stay behind their explicit command.
    const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    for (const scriptName of ["build:desktop", "release", "release:build"]) {
      expect(packageJson.scripts[scriptName]).not.toContain("foleyardOpenDevTools=true");
      expect(packageJson.scripts[scriptName]).not.toContain("foleyardResetDatabaseOnBuild=true");
    }
    expect(packageJson.scripts["build:desktop:disposable"]).toContain("foleyardOpenDevTools=true");
    expect(packageJson.scripts["build:desktop:disposable"]).toContain("foleyardResetDatabaseOnBuild=true");

    // A chosen folder and its descendants resolve; siblings do not.
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "foleyard-grant-"));
    try {
      const chosen = path.join(temp, "chosen");
      const child = path.join(chosen, "pack", "hit.wav");
      const sibling = path.join(temp, "sibling", "hit.wav");
      fs.mkdirSync(path.dirname(child), { recursive: true });
      fs.mkdirSync(path.dirname(sibling), { recursive: true });
      fs.writeFileSync(child, "audio");
      fs.writeFileSync(sibling, "audio");
      await registerGrant(chosen);
      expect(await resolveGrantedExistingPath(child)).not.toBeNull();
      expect(await resolveGrantedExistingPath(sibling)).toBeNull();
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
    }

    // The desktop bridge: server snapshot first, live snapshot after.
    expect(getDesktopServerSnapshot()).toBe(false);
    expect(fileTableGridClass(false)).toBe(FILE_TABLE_GRID_DEFAULT);
    expect(fileTableGridClass(true)).not.toBe(FILE_TABLE_GRID_DEFAULT);
    const withoutBridge = renderToString(createElement(Probe));
    (globalThis as unknown as { window?: unknown }).window = {
      desktopBridge: { isDesktop: true },
    };
    expect(getDesktopSnapshot()).toBe(true);
    expect(renderToString(createElement(Probe))).toBe(withoutBridge);

    (globalThis as unknown as { window?: unknown }).window = undefined;
    expect(getDesktopSnapshot()).toBe(false);
    (globalThis as unknown as { window?: unknown }).window = {};
    expect(getDesktopSnapshot()).toBe(false);
    let notifications = 0;
    const unsubscribe = subscribeDesktopBridge(() => {
      notifications += 1;
    });
    try {
      (globalThis as { window: { desktopBridge?: unknown } }).window.desktopBridge = {
        isDesktop: true,
      };
      expect(notifications).toBe(1);
      expect(getDesktopSnapshot()).toBe(true);
      notifyDesktopBridgeChanged();
      expect(notifications).toBe(2);
    } finally {
      unsubscribe();
    }
  });

  it("holds the desktop route boundary: files, paths and grants", async () => {
    const temp = await fsp.mkdtemp(path.join(os.tmpdir(), "foleyard-dt-routes-"));
    try {
      const root = path.join(temp, "library");
      const granted = path.join(temp, "chosen");
      const outside = path.join(temp, "private");
      await Promise.all([root, granted, outside].map((p) => fsp.mkdir(p)));
      const inside = path.join(root, "hit.wav");
      const privateFile = path.join(temp, "private.wav");
      await Promise.all([inside, privateFile].map((p) => fsp.writeFile(p, "audio")));
      dbMocks.roots = [root];
      dbMocks.files = new Map([
        ["inside", { id: "inside", filename: "hit.wav", path: inside, removedAt: null }],
        ["outside", { id: "outside", filename: "private.wav", path: privateFile, removedAt: null }],
        ["missing", { id: "missing", filename: "gone.wav", path: path.join(root, "gone.wav"), removedAt: null }],
        ["removed", { id: "removed", filename: "old.wav", path: inside, removedAt: "2026-01-01T00:00:00.000Z" }],
      ]);
      await registerGrant(granted);

      const fileRequest = (id?: string) =>
        new NextRequest(`http://localhost/api/desktop/file${id === undefined ? "" : `?id=${id}`}`);

      // Indexed files resolve inside the roots and refuse outside them.
      const resolved = await desktopFileGET(fileRequest("inside"));
      expect(resolved.status).toBe(200);
      expect(((await resolved.json()) as { file: { path: string } }).file.path).toBe(
        await fsp.realpath(inside),
      );
      const outsideFile = await desktopFileGET(fileRequest("outside"));
      expect(outsideFile.status).toBe(404);
      expect(((await outsideFile.json()) as { error: string }).error).toMatch(/outside the Library/i);
      expect(await fsp.readFile(privateFile, "utf8"), "refused files stay on disk").toBe("audio");
      const gone = await desktopFileGET(fileRequest("missing"));
      expect(gone.status).toBe(404);
      expect(((await gone.json()) as { error: string }).error).toMatch(/no longer exists/i);
      for (const [id, status] of [["unknown", 404], ["removed", 404]] as const) {
        expect((await desktopFileGET(fileRequest(id))).status).toBe(status);
      }
      expect((await desktopFileGET(fileRequest(undefined))).status).toBe(400);

      const pathRequest = (candidatePath: string) =>
        new NextRequest("http://localhost/api/desktop/path", {
          method: "POST",
          body: JSON.stringify({ path: candidatePath }),
        });

      // Paths resolve inside the roots or a grant, and refuse the rest.
      const insidePath = await desktopPathPOST(pathRequest(root));
      expect(insidePath.status).toBe(200);
      expect(((await insidePath.json()) as { path: string }).path).toBe(await fsp.realpath(root));
      const grantedPath = await desktopPathPOST(pathRequest(granted));
      expect(grantedPath.status).toBe(200);
      const refusedPath = await desktopPathPOST(pathRequest(outside));
      expect(refusedPath.status).toBe(404);
      expect(((await refusedPath.json()) as { error: string }).error).toMatch(/outside the Library/i);
      const traversal = await desktopPathPOST(pathRequest(path.join(root, "..", "private.wav")));
      expect(traversal.status).toBe(404);

      // Grants need the desktop secret and issue opaque tokens.
      vi.stubEnv("FOLEYARD_GRANT_SECRET", "test-desktop-secret");
      const grantRequest = (secret?: string) =>
        new NextRequest("http://localhost/api/desktop/grants", {
          method: "POST",
          headers: secret ? { "x-foleyard-grant-secret": secret } : {},
          body: JSON.stringify({ path: granted }),
        });
      expect((await desktopGrantsPOST(grantRequest())).status).toBe(403);
      expect((await desktopGrantsPOST(grantRequest("wrong"))).status).toBe(403);
      const grantResponse = await desktopGrantsPOST(grantRequest("test-desktop-secret"));
      expect(grantResponse.status).toBe(200);
      const grant = (await grantResponse.json()) as { path: string; grantToken: string };
      expect(grant.path).toBe(await fsp.realpath(granted));
      expect(grant.grantToken).toEqual(expect.any(String));
      expect(grant.grantToken).not.toContain(granted);
    } finally {
      await fsp.rm(temp, { recursive: true, force: true });
    }
  });

  it("refuses corrupt or downgraded native binaries before they execute", async () => {
    expect(() => verifyDigest(Buffer.from("tampered"), `sha256:${"0".repeat(64)}`)).toThrow(
      /checksum mismatch/,
    );
    const data = Buffer.from("native bytes");
    expect(() =>
      verifyDigest(data, `sha256:${createHash("sha256").update(data).digest("hex")}`),
    ).not.toThrow();
    expect(() => verifyDigest(Buffer.from("native"), "")).toThrow(/digest/);

    const get = vi.spyOn(https, "get");
    await expect(downloadWithRedirects("http://example.com/binary")).rejects.toThrow(/non-HTTPS/);
    expect(get).not.toHaveBeenCalled();

    get.mockImplementation(((url: unknown, options: unknown, callback: (res: unknown) => void) => {
      const req = Object.assign(new EventEmitter(), { setTimeout: () => {}, destroy: () => {} });
      queueMicrotask(() =>
        callback({ statusCode: 302, headers: { location: "http://example.com/binary" }, resume: () => {} }),
      );
      return req;
    }) as unknown as typeof https.get);
    await expect(downloadWithRedirects("https://example.com/binary")).rejects.toThrow(/non-HTTPS/);
    expect(get).toHaveBeenCalledOnce();
  });
});
