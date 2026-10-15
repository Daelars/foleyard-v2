import { createRequire } from "node:module";
import { Module } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Area: #284. Native drag-out must honour enabled Drop Rules policy: the
// bridge supplies the command's declared input and a staging grant, drags
// the extension's staged path, and only falls back to the raw indexed file
// when the policy is disabled or not applicable. A policy that is enabled
// but fails must be visible instead of silently dragging the raw file.
//
// The bridge is a plain Node module that talks to the local server with
// `fetch`, so the server side is a scripted router here. The staging
// directory is real on disk so the bridge's mkdir/mkdtemp path is exercised.

const cjsRequire = createRequire(import.meta.url);

type LoadFn = (this: unknown, request: string, ...rest: unknown[]) => unknown;
const ModuleWithLoad = Module as unknown as { _load: LoadFn };
const originalLoad = ModuleWithLoad._load;

type MockFn = ReturnType<typeof vi.fn>;

interface FakeElectron {
  app: {
    isPackaged: boolean;
    getPath: (name: string) => string;
    getAppPath: () => string;
    exit: MockFn;
  };
  clipboard: { writeText: MockFn };
  nativeImage: { createFromBuffer: MockFn };
  shell: { showItemInFolder: MockFn; openPath: MockFn };
  dialog: { showErrorBox: MockFn };
  ipcMain: { on: MockFn; handle: MockFn };
}

type DesktopService = {
  startDragFile: (
    event: { sender: { send: MockFn; startDrag: MockFn } },
    payload: { fileIds: string[] },
  ) => Promise<void>;
};

let userDataDir: string;
let electronFake: FakeElectron;
let service: DesktopService;

const DROP_RULES_EXTENSION_ID = "drop-rules-v2";
const DROP_RULES_PREPARE_DRAG = "drop-rules-v2.prepare-drag";

type Reply = { status: number; body: unknown };
type FetchCall = { pathname: string; init: RequestInit };

const fetchCalls: FetchCall[] = [];
let route: (pathname: string, init: RequestInit) => Reply;

const json = (body: unknown, status = 200): Reply => ({ status, body });

function responseFor(reply: Reply): Response {
  return {
    ok: reply.status >= 200 && reply.status < 300,
    status: reply.status,
    json: async () => reply.body,
  } as unknown as Response;
}

function bodyOf(init: RequestInit): Record<string, unknown> {
  if (typeof init.body !== "string") return {};
  try {
    return JSON.parse(init.body) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function callsTo(pathname: string): FetchCall[] {
  return fetchCalls.filter((call) => call.pathname === pathname);
}

function installElectronFake(): void {
  const handlers: Record<string, unknown> = {};
  electronFake = {
    app: {
      isPackaged: false,
      getPath: () => userDataDir,
      getAppPath: () => process.cwd(),
      exit: vi.fn(),
    },
    clipboard: { writeText: vi.fn() },
    nativeImage: { createFromBuffer: vi.fn(() => ({})) },
    shell: { showItemInFolder: vi.fn(), openPath: vi.fn() },
    dialog: { showErrorBox: vi.fn() },
    ipcMain: {
      on: vi.fn((channel: string, listener: unknown) => {
        handlers[channel] = listener;
      }),
      handle: vi.fn(),
    },
  };
  ModuleWithLoad._load = function (request: string, ...rest: unknown[]) {
    if (request === "electron") return electronFake;
    return originalLoad.call(this, request, ...rest);
  };
}

function loadDesktopService(): DesktopService {
  for (const key of Object.keys(cjsRequire.cache)) {
    if (key.includes(`electron${path.sep}main`)) delete cjsRequire.cache[key];
  }
  return cjsRequire("../../../electron/main/desktop-service.cjs") as DesktopService;
}

function dragEvent() {
  return { sender: { send: vi.fn(), startDrag: vi.fn() } };
}

/** The extension's staged result, shaped exactly like the execute envelope. */
function stagedOutcome(dragPath: string) {
  return json({
    ok: true,
    outcome: {
      kind: "immediate",
      value: { fileId: "a", outputName: "001-hit.wav", dragPath, staged: true },
    },
  });
}

beforeEach(() => {
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "foleyard-dragout-"));
  fetchCalls.length = 0;
  route = (pathname) => {
    throw new Error(`unexpected fetch: ${pathname}`);
  };
  vi.stubEnv("FOLEYARD_GRANT_SECRET", "drag-out-secret");
  vi.stubGlobal("fetch", async (input: unknown, init?: RequestInit) => {
    const url = new URL(String(input));
    const call = { pathname: url.pathname, init: init ?? {} };
    fetchCalls.push(call);
    return responseFor(route(url.pathname, call.init));
  });
  installElectronFake();
  service = loadDesktopService();
});

afterEach(() => {
  ModuleWithLoad._load = originalLoad;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  fs.rmSync(userDataDir, { recursive: true, force: true });
});

describe("native drag-out honours Drop Rules policy", () => {
  it("supplies the declared input and staging grant, and drags the staged path", async () => {
    const stagingPath = path.join(userDataDir, "stage", "001-hit.wav");
    fs.mkdirSync(path.dirname(stagingPath), { recursive: true });
    fs.writeFileSync(stagingPath, "audio");

    route = (pathname) => {
      switch (pathname) {
        case "/api/extensions-v2/availability":
          return json({
            ok: true,
            available: true,
            extensionId: DROP_RULES_EXTENSION_ID,
            commandId: DROP_RULES_PREPARE_DRAG,
          });
        case "/api/desktop/grants":
          return json({ ok: true, path: path.dirname(stagingPath), proof: "proof-1" });
        case "/api/extensions-v2/grants":
          return json({ ok: true, grantId: "vgrant_stage", path: path.dirname(stagingPath) });
        case "/api/extensions-v2/execute":
          return stagedOutcome(stagingPath);
        case "/api/desktop/path":
          return json({ path: stagingPath });
        default:
          throw new Error(`unexpected fetch: ${pathname}`);
      }
    };

    const event = dragEvent();
    await service.startDragFile(event, { fileIds: ["a"] });

    // The command's declared input carries the file input AND the staging
    // grant the handler's schema requires.
    const execute = callsTo("/api/extensions-v2/execute");
    expect(execute).toHaveLength(1);
    expect(bodyOf(execute[0].init)).toMatchObject({
      extensionId: DROP_RULES_EXTENSION_ID,
      commandId: DROP_RULES_PREPARE_DRAG,
      input: { fileId: "a", stagingGrantId: "vgrant_stage" },
      selection: { fileIds: ["a"], dropFileCount: 1 },
    });

    // The staging grant was minted for Drop Rules against a real owned
    // staging directory under the app data root, via the desktop secret.
    const grants = callsTo("/api/desktop/grants");
    expect(grants).toHaveLength(1);
    const grantBody = bodyOf(grants[0].init);
    expect(grantBody.extensionId).toBe(DROP_RULES_EXTENSION_ID);
    expect(grantBody.grantKind).toBe("destination");
    expect(typeof grantBody.path).toBe("string");
    expect(grantBody.path as string).toContain("drag-staging");
    expect((grants[0].init.headers as Record<string, string>)["x-foleyard-grant-secret"]).toBe(
      "drag-out-secret",
    );

    // The returned drag path was re-checked for readable containment, and the
    // staged copy is what starts the native drag.
    expect(callsTo("/api/desktop/path")).toHaveLength(1);
    expect(event.sender.startDrag).toHaveBeenCalledTimes(1);
    expect(event.sender.startDrag).toHaveBeenCalledWith(
      expect.objectContaining({ files: [stagingPath] }),
    );
    expect(event.sender.send).not.toHaveBeenCalled();
  });

  it("drags the raw indexed file only when Drop Rules is disabled", async () => {
    const rawPath = path.join(userDataDir, "library", "hit.wav");
    fs.mkdirSync(path.dirname(rawPath), { recursive: true });
    fs.writeFileSync(rawPath, "audio");

    route = (pathname) => {
      switch (pathname) {
        case "/api/extensions-v2/availability":
          return json({
            ok: true,
            available: false,
            code: "disabled",
            reason: "Drop Rules is disabled.",
          });
        case "/api/desktop/file":
          return json({ file: { id: "a", path: rawPath, filename: "hit.wav" } });
        default:
          throw new Error(`unexpected fetch: ${pathname}`);
      }
    };

    const event = dragEvent();
    await service.startDragFile(event, { fileIds: ["a"] });

    expect(callsTo("/api/extensions-v2/execute")).toHaveLength(0);
    expect(callsTo("/api/desktop/grants")).toHaveLength(0);
    expect(event.sender.startDrag).toHaveBeenCalledWith(
      expect.objectContaining({ files: [rawPath] }),
    );
  });

  it("drags the raw indexed file when the policy is not applicable here", async () => {
    const rawPath = path.join(userDataDir, "library", "hit.wav");
    route = (pathname) => {
      switch (pathname) {
        case "/api/extensions-v2/availability":
          return json({ ok: true, available: false, code: "capability-unavailable" });
        case "/api/desktop/file":
          return json({ file: { id: "a", path: rawPath, filename: "hit.wav" } });
        default:
          throw new Error(`unexpected fetch: ${pathname}`);
      }
    };

    const event = dragEvent();
    await service.startDragFile(event, { fileIds: ["a"] });

    expect(callsTo("/api/extensions-v2/execute")).toHaveLength(0);
    expect(event.sender.startDrag).toHaveBeenCalledWith(
      expect.objectContaining({ files: [rawPath] }),
    );
  });

  it("reports an operational failure instead of silently dragging raw", async () => {
    route = (pathname) => {
      switch (pathname) {
        case "/api/extensions-v2/availability":
          return json({ ok: true, available: true });
        case "/api/desktop/grants":
          return json({ ok: true, path: userDataDir, proof: "proof-1" });
        case "/api/extensions-v2/grants":
          return json({ ok: true, grantId: "vgrant_stage", path: userDataDir });
        case "/api/extensions-v2/execute":
          return json({ ok: false, error: { code: "handler-failed", message: "staging exploded" } }, 500);
        case "/api/desktop/file":
          return json({ file: { id: "a", path: "/library/hit.wav", filename: "hit.wav" } });
        default:
          throw new Error(`unexpected fetch: ${pathname}`);
      }
    };

    const event = dragEvent();
    await service.startDragFile(event, { fileIds: ["a"] });

    expect(callsTo("/api/desktop/file")).toHaveLength(0);
    expect(event.sender.startDrag).not.toHaveBeenCalled();
    expect(event.sender.send).toHaveBeenCalledTimes(1);
    expect(String(event.sender.send.mock.calls[0][1])).toMatch(/Drop Rules/i);
  });

  it("fails visibly when the policy cannot be reached at all", async () => {
    route = (pathname) => {
      if (pathname === "/api/extensions-v2/availability") {
        throw new Error("connection refused");
      }
      throw new Error(`unexpected fetch: ${pathname}`);
    };

    const event = dragEvent();
    await service.startDragFile(event, { fileIds: ["a"] });

    expect(callsTo("/api/desktop/file")).toHaveLength(0);
    expect(event.sender.startDrag).not.toHaveBeenCalled();
    expect(event.sender.send).toHaveBeenCalledTimes(1);
  });

  it("treats an enabled-but-denied policy as a visible failure, not a raw drag", async () => {
    route = (pathname) => {
      switch (pathname) {
        case "/api/extensions-v2/availability":
          return json({ ok: true, available: false, code: "permission-denied" });
        case "/api/desktop/file":
          return json({ file: { id: "a", path: "/library/hit.wav", filename: "hit.wav" } });
        default:
          throw new Error(`unexpected fetch: ${pathname}`);
      }
    };

    const event = dragEvent();
    await service.startDragFile(event, { fileIds: ["a"] });

    expect(callsTo("/api/desktop/file")).toHaveLength(0);
    expect(event.sender.startDrag).not.toHaveBeenCalled();
    expect(event.sender.send).toHaveBeenCalledTimes(1);
  });

  it("refuses a returned drag path that fails the readable containment check", async () => {
    route = (pathname) => {
      switch (pathname) {
        case "/api/extensions-v2/availability":
          return json({ ok: true, available: true });
        case "/api/desktop/grants":
          return json({ ok: true, path: userDataDir, proof: "proof-1" });
        case "/api/extensions-v2/grants":
          return json({ ok: true, grantId: "vgrant_stage", path: userDataDir });
        case "/api/extensions-v2/execute":
          return stagedOutcome(path.join(os.tmpdir(), "outside", "evil.wav"));
        case "/api/desktop/path":
          return json({ error: "Path is outside the Library" }, 404);
        default:
          throw new Error(`unexpected fetch: ${pathname}`);
      }
    };

    const event = dragEvent();
    await service.startDragFile(event, { fileIds: ["a"] });

    expect(event.sender.startDrag).not.toHaveBeenCalled();
    expect(event.sender.send).toHaveBeenCalledTimes(1);
  });
});
