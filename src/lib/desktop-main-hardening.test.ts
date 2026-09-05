import { createRequire } from "node:module";
import { Module } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cjsRequire = createRequire(import.meta.url);

type LoadFn = (this: unknown, request: string, ...rest: unknown[]) => unknown;
const ModuleWithLoad = Module as unknown as { _load: LoadFn };
const originalLoad = ModuleWithLoad._load;

type MockFn = ReturnType<typeof vi.fn>;
type LoadStub = unknown;
type IpcHandler = (...args: Array<unknown>) => unknown;

interface FakeElectron {
  app: {
    isPackaged: boolean;
    getPath: (name: string) => string;
    getAppPath: () => string;
    exit: MockFn;
  };
  dialog: {
    showErrorBox: MockFn;
  };
  ipcMain: {
    handlers: Record<string, IpcHandler>;
    on: MockFn;
    handle: MockFn;
  };
  clipboard: { writeText: MockFn };
  nativeImage: { createFromBuffer: MockFn };
  shell: { showItemInFolder: MockFn; openPath: MockFn };
}

interface FakeWindow {
  sends: unknown[][];
  isDestroyed: () => boolean;
  webContents: { send: (channel: unknown, ...payload: unknown[]) => void };
}

type ElectronMainExports = Record<string, (...args: Array<unknown>) => unknown>;

let electronFake: FakeElectron;
let loadStubs: Record<string, LoadStub>;

function installLoadInterception() {
  ModuleWithLoad._load = function (request: string, ...rest: unknown[]) {
    if (request === "electron") {
      return electronFake;
    }
    if (Object.hasOwn(loadStubs, request)) {
      const stub = loadStubs[request];
      if (stub instanceof Error) {
        throw stub;
      }
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
    if (key.includes(`electron${path.sep}main`)) {
      delete cjsRequire.cache[key];
    }
  }
}

function requireElectronMain(relativePath: string): ElectronMainExports {
  return cjsRequire(
    `../../electron/main/${relativePath}`,
  ) as ElectronMainExports;
}

function buildElectronFake(userDataDir: string): FakeElectron {
  const handlers: Record<string, IpcHandler> = {};
  return {
    app: {
      isPackaged: false,
      getPath: () => userDataDir,
      getAppPath: () => process.cwd(),
      exit: vi.fn(),
    },
    dialog: {
      showErrorBox: vi.fn(),
    },
    ipcMain: {
      handlers,
      on: vi.fn(),
      handle: vi.fn((channel: string, listener: IpcHandler) => {
        handlers[channel] = listener;
      }),
    },
    clipboard: { writeText: vi.fn() },
    nativeImage: { createFromBuffer: vi.fn(() => ({})) },
    shell: { showItemInFolder: vi.fn(), openPath: vi.fn() },
  };
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
  electronFake = buildElectronFake(
    fs.mkdtempSync(path.join(os.tmpdir(), "foleyard-main-test-")),
  );
  installLoadInterception();
  dropElectronModulesFromCache();
});

afterEach(() => {
  restoreLoadInterception();
  dropElectronModulesFromCache();
});

describe("next-server adapter", () => {
  it("accepts the installed Next.js major version", () => {
    const adapter = requireElectronMain("next-server-adapter.cjs");

    expect(adapter.SUPPORTED_NEXT_MAJOR).toBe(16);
    expect(adapter.assertSupportedNextVersion()).toMatch(/^16\./);
  });

  it("fails loud and localised when the installed Next.js is unsupported", () => {
    loadStubs["next/package.json"] = { version: "99.0.0" };
    const adapter = requireElectronMain("next-server-adapter.cjs");

    expect(() => adapter.assertSupportedNextVersion()).toThrowError(
      /Foleyard desktop cannot start.*supports Next\.js v16.*99\.0\.0.*next-server-adapter\.cjs/,
    );
  });

  it("fails loud and localised when the Next.js version is unknown", () => {
    loadStubs["next/package.json"] = Object.assign(
      new Error("Cannot find module 'next/package.json'"),
      { code: "MODULE_NOT_FOUND" },
    );
    const adapter = requireElectronMain("next-server-adapter.cjs");

    expect(() => adapter.assertSupportedNextVersion()).toThrowError(
      /Foleyard desktop cannot start.*installed version is unknown/,
    );
  });

  it("fails loud and localised when the private server module moved", () => {
    loadStubs["next/dist/server/lib/start-server"] = Object.assign(
      new Error("Cannot find module 'next/dist/server/lib/start-server'"),
      { code: "MODULE_NOT_FOUND" },
    );
    const adapter = requireElectronMain("next-server-adapter.cjs");

    expect(() => adapter.loadPrivateStartServer()).toThrowError(
      /Foleyard desktop cannot start.*private module "next\/dist\/server\/lib\/start-server".*upgrade probably moved it/,
    );
  });

  it("rejects a moved private module from startProductionServer with a loud error", async () => {
    loadStubs["next/dist/server/lib/start-server"] = Object.assign(
      new Error("Cannot find module 'next/dist/server/lib/start-server'"),
      { code: "MODULE_NOT_FOUND" },
    );
    const adapter = requireElectronMain("next-server-adapter.cjs");

    await expect(
      adapter.startProductionServer({ dir: process.cwd(), hostname: "127.0.0.1" }),
    ).rejects.toThrow(/Foleyard desktop cannot start/);
  });

  it("allocates a usable loopback port and validates startup", async () => {
    const adapter = requireElectronMain("next-server-adapter.cjs");

    const port = await adapter.allocateLoopbackPort("127.0.0.1");
    expect(Number.isInteger(port)).toBe(true);
    expect(port).toBeGreaterThan(0);
    expect(port).toBeLessThan(65536);

    expect(() => adapter.assertServerStarted(port)).not.toThrow();
    expect(() => adapter.assertServerStarted(0)).toThrowError(
      /Foleyard desktop failed to start/,
    );
  });
});

describe("main-process error reporting", () => {
  function loadErrors() {
    dropElectronModulesFromCache();
    return requireElectronMain("errors.cjs");
  }

  function readLog(userDataDir: string) {
    const logPath = path.join(userDataDir, "desktop-errors.log");
    return fs.existsSync(logPath)
      ? fs.readFileSync(logPath, "utf8")
      : "";
  }

  it("logs every error but shows at most one dialog per session", () => {
    const errors = loadErrors();
    errors.resetMainProcessErrorState();

    errors.reportMainProcessError(new Error("first boom"));
    errors.reportMainProcessError(new Error("second boom"));

    expect(electronFake.dialog.showErrorBox).toHaveBeenCalledTimes(1);
    const log = readLog(electronFake.app.getPath("userData"));
    expect(log).toContain("first boom");
    expect(log).toContain("second boom");
  });

  it("forwards errors to the renderer window when present", () => {
    const errors = loadErrors();
    errors.resetMainProcessErrorState();
    const send = vi.fn();
    errors.setMainWindow({ isDestroyed: () => false, webContents: { send } });

    errors.reportMainProcessError(new Error("renderer ping"), { dialog: false });

    expect(send).toHaveBeenCalledWith(
      "desktop:action-error",
      expect.stringContaining("renderer ping"),
    );
    errors.setMainWindow(null);
  });

  it("terminates the process for fatal errors but keeps running otherwise", () => {
    const errors = loadErrors();
    errors.resetMainProcessErrorState();

    errors.reportMainProcessError(new Error("recoverable"), { dialog: false });
    expect(electronFake.app.exit).not.toHaveBeenCalled();

    errors.reportMainProcessError(new Error("fatal"), { dialog: false, fatal: true });
    expect(electronFake.app.exit).toHaveBeenCalledWith(1);
  });

  it("still shows the dialog for fatal startup failures", () => {
    const errors = loadErrors();
    errors.resetMainProcessErrorState();

    errors.reportMainProcessError(new Error("startup failed"), { fatal: true });

    expect(electronFake.dialog.showErrorBox).toHaveBeenCalledTimes(1);
    expect(electronFake.app.exit).toHaveBeenCalledWith(1);
  });
});

describe("simulate-update gating", () => {
  function sentMessages(fakeWindow: { sends: unknown[][] }) {
    return fakeWindow.sends;
  }

  function buildFakeWindow(): FakeWindow {
    const fakeWindow: FakeWindow = {
      sends: [],
      isDestroyed: () => false,
      webContents: { send: () => {} },
    };
    fakeWindow.webContents.send = (channel, ...payload) => {
      fakeWindow.sends.push([channel, ...payload]);
    };
    return fakeWindow;
  }

  function registerIpc() {
    dropElectronModulesFromCache();
    const ipc = requireElectronMain("ipc.cjs");
    ipc.registerIpcHandlers();
    return electronFake.ipcMain.handlers;
  }

  it("does not register the fake-update endpoint in the packaged app", () => {
    electronFake.app.isPackaged = true;

    const handlers = registerIpc();

    expect(handlers["desktop:simulate-update"]).toBeUndefined();
    expect(handlers["desktop:check-for-updates"]).toBeDefined();
  });

  it("keeps the fake-update endpoint usable in development", async () => {
    electronFake.app.isPackaged = false;

    const handlers = registerIpc();
    // registerIpc reloads the main modules; grab the same auto-updater
    // instance the fresh ipc handlers close over.
    const autoUpdater = requireElectronMain("auto-updater.cjs");
    const fakeWindow = buildFakeWindow();
    autoUpdater.setUpdateWindow(fakeWindow);
    const simulate = handlers["desktop:simulate-update"];
    expect(simulate).toBeDefined();

    await simulate();
    expect(sentMessages(fakeWindow)[0]?.[0]).toBe("desktop:update-available");

    autoUpdater.setUpdateWindow(null);
  });

  it("never emits fake update events in the packaged app, even when called directly", () => {
    electronFake.app.isPackaged = true;
    dropElectronModulesFromCache();
    const autoUpdater = requireElectronMain("auto-updater.cjs");
    const fakeWindow = buildFakeWindow();
    autoUpdater.setUpdateWindow(fakeWindow);

    autoUpdater.simulateUpdate();

    expect(sentMessages(fakeWindow)).toHaveLength(0);
    autoUpdater.setUpdateWindow(null);
  });
});
