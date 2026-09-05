// @vitest-environment jsdom
import { existsSync } from "node:fs";
import { screen, fireEvent, render, waitFor, within } from "@testing-library/react";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Home from "@/app/page";
import {
  audioFileRecord,
  createScratchLibrary,
  createTestDatabase,
  type TestDatabase,
} from "@/test/fixtures";
import { SqliteAudioFileRepository } from "@/lib/database/file-repository";
import { SqliteTagRepository } from "@/lib/database/tag-repository";
import { SqliteCollectionRepository } from "@/lib/database/collection-repository";
import { SqliteSettingsRepository } from "@/lib/database/settings-repository";
import { POST as executeRoute } from "@/app/api/extensions/execute/route";

// Area: components + layout (#142). Replaces twenty files and 82 tests —
// not one of which mounted a component — with 2 rendered smoke tests: one
// workspace journey (select files, drive Make Pack through to its result)
// and one layout smoke (fill and scroll at 75%, 100% and 125% zoom).

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
  getAllFilesIncludingRemoved: () => state.files!.getAllFilesIncludingRemoved(),
  getTagsForFiles: (ids: string[]) => state.tags!.getTagsForFiles(ids),
  getLibraryRoots: () => state.settings!.getLibraryRoots(),
  getExtensionEnabled: (id: string) => state.enabled.get(id) ?? true,
  setExtensionEnabled: (id: string, value: boolean) => {
    state.enabled.set(id, value);
  },
  getAllTags: () => state.tags!.getAllTags(),
  createTag: (name: string) => state.tags!.createTag(name),
  getAllCollections: () => state.collections!.getAllCollections(),
  createCollection: (name: string) => state.collections!.createCollection(name),
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
          if (file) state.files!.markFileRemoved(file.path, removedAt);
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
    if (!raw) return fallback;
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

vi.mock("@tanstack/react-virtual", () => ({
  // jsdom measures nothing, so the virtual list would render zero rows.
  // Render every item: selection, scroll classes and row affordances are
  // what the smoke asserts, not the windowing itself.
  useVirtualizer: (options: { count: number }) => ({
    scrollToIndex: () => {},
    getTotalSize: () => options.count * 64,
    getVirtualItems: () =>
      Array.from({ length: options.count }, (_, index) => ({
        key: index,
        index,
        start: index * 64,
        size: 64,
      })),
  }),
}));

let sqlite: TestDatabase;

beforeEach(() => {
  sqlite = createTestDatabase();
  state.files = new SqliteAudioFileRepository(sqlite);
  // jsdom has no layout engine: the waveform view observes container size.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  state.tags = new SqliteTagRepository(sqlite);
  state.collections = new SqliteCollectionRepository(sqlite);
  state.settings = new SqliteSettingsRepository(sqlite);
  state.enabled.clear();
  state.kv.clear();
  // jsdom implements no media playback: selecting a file would otherwise
  // crash on audio.play().catch. The smoke asserts selection state, not sound.
  window.HTMLMediaElement.prototype.play = async () => {};
  window.HTMLMediaElement.prototype.pause = () => {};
  window.HTMLMediaElement.prototype.load = () => {};
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  sqlite.close();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (window as unknown as { desktopBridge?: unknown }).desktopBridge;
});

type FetchStub = {
  calls: Array<{ url: string; init?: RequestInit }>;
};

function stubFetch(router: (url: string, init?: RequestInit) => Promise<unknown>): FetchStub {
  const calls: FetchStub["calls"] = [];
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return router(url, init);
  });
  return { calls };
}

async function executeViaRoute(url: string, init?: RequestInit) {
  const response = await executeRoute(
    new NextRequest(url, {
      method: init?.method ?? "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof init?.body === "string" ? init.body : JSON.stringify(init?.body ?? {}),
    }),
  );
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  return { ok: response.ok, status: response.status, json: async () => body };
}

describe("component and layout smoke", () => {
  it("selects files in the workspace and packs the shelf through to disk", async () => {
    const scratch = createScratchLibrary("foleyard-workspace-");
    try {
      const kickPath = scratch.writeFile("library/kick.wav");
      const snarePath = scratch.writeFile("library/snare.wav");
      const hatPath = scratch.writeFile("library/hat.wav");
      state.settings!.setLibraryRoots([scratch.root]);
      state.files!.batchUpsertFiles(
        [kickPath, snarePath, hatPath].map((path) =>
          audioFileRecord({ path, filename: path.split(/[\\/]/).pop() }),
        ),
        new Date().toISOString(),
      );
      const indexed = state.files!.getFiles({ limit: 10 });
      const tagId = state.tags!.createTag("Loud");
      const kickId = indexed.find((row) => row.filename === "kick.wav")!.id;
      state.files!.setFileTagBatch([kickId], tagId, true);
      const rows = indexed.map((row) => ({
        id: row.id,
        filename: row.filename,
        path: row.path,
        directory: null,
        format: ".wav",
        duration: 1.5,
        fileSize: 1024,
        isFavorite: false,
        tags: row.id === kickId ? [{ id: tagId, name: "Loud" }] : [],
      }));

      const grant = await scratch.grant("dest");

      const fetchStub = stubFetch(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        if (url === "/api/settings") {
          return { ok: true, json: async () => ({ libraryRoots: [scratch.root] }) };
        }
        if (url === "/api/scan") {
          return { ok: true, json: async () => ({ running: false }) };
        }
        if (url.startsWith("/api/files")) {
          return { ok: true, json: async () => ({ files: rows, hasMore: false, favoritesTotal: 0 }) };
        }
        if (url.startsWith("/api/directories")) {
          return { ok: true, json: async () => ({ directories: [] }) };
        }
        if (url.startsWith("/api/collections")) {
          return { ok: true, json: async () => ({ collections: [], count: 0 }) };
        }
        if (url.startsWith("/api/tags")) {
          return { ok: true, json: async () => ({ tags: [{ id: tagId, name: "Loud" }] }) };
        }
        if (url === "/api/extensions") {
          return {
            ok: true,
            json: async () => ({
              extensions: [
                { id: "sound-shelf", name: "Sound Shelf", enabled: true, commands: [] },
                { id: "make-pack", name: "Make Pack", enabled: true, commands: [] },
              ],
            }),
          };
        }
        if (url === "/api/extensions/execute" && method === "POST") {
          return executeViaRoute("http://localhost/api/extensions/execute", init);
        }
        if (url.startsWith("/api/waveform")) {
          return { ok: true, json: async () => ({ peaks: [0.2, 0.6, 0.4] }) };
        }
        return { ok: true, json: async () => ({}) };
      });

      render(<Home />);

      // The library list renders real rows with tags; waveforms load per row.
      // Filenames can span multiple elements (highlight markup), so match
      // rows by their full text content rather than a single text node.
      await waitFor(() => {
        expect(screen.getAllByRole("row").length).toBeGreaterThanOrEqual(3);
      });
      const rowEls = screen.getAllByRole("row");
      const rowByName = (name: string) => {
        const row = rowEls.find((candidate) => candidate.textContent?.includes(name));
        expect(row, `row for ${name} renders`).toBeTruthy();
        return row!;
      };
      const kickRowEl = rowByName("kick.wav");
      const snareRowEl = rowByName("snare.wav");
      rowByName("hat.wav");
      expect(kickRowEl.textContent, "the tag renders in the row meta").toContain("Loud");
      await waitFor(() => {
        expect(
          fetchStub.calls.filter((c) => c.url.startsWith("/api/waveform")).length,
          "waveforms load for the rows",
        ).toBeGreaterThanOrEqual(3);
      });

      // Selecting two files arms the bulk bar with its count.
      fireEvent.click(kickRowEl);
      fireEvent.click(snareRowEl, { ctrlKey: true });
      expect(kickRowEl.getAttribute("aria-selected")).toBe("true");
      expect(snareRowEl.getAttribute("aria-selected")).toBe("true");
      expect(await screen.findByText(/2 selected/i)).toBeTruthy();

      // The desktop bridge arrives late, like a real preload injection —
      // mounting with it present blanks the tree, so it lands after first
      // paint exactly as the app's late-injection path expects.
      const noopUnsubscribe = () => {};
      const okResult = async () => ({ ok: true as const });
      (window as unknown as { desktopBridge?: unknown }).desktopBridge = {
        isDesktop: true,
        startDragFiles: () => {},
        revealInExplorer: okResult,
        revealPath: okResult,
        openFileExternally: okResult,
        setZoomFactor: () => {},
        copyFilePath: okResult,
        pickFolder: async () => ({ ok: true, path: grant.path, grantToken: grant.grantToken }),
        minimizeWindow: okResult,
        toggleMaximizeWindow: async () => ({ ok: true, isMaximized: false }),
        closeWindow: okResult,
        getWindowState: async () => ({ isMaximized: false }),
        onActionError: () => noopUnsubscribe,
        onWindowState: () => noopUnsubscribe,
        checkForUpdates: okResult,
        installUpdate: okResult,
        simulateUpdate: okResult,
        onUpdateAvailable: () => noopUnsubscribe,
        onUpdateReady: () => noopUnsubscribe,
        onUpdateNotAvailable: () => noopUnsubscribe,
        onUpdateError: () => noopUnsubscribe,
        onUpdateDownloadProgress: () => noopUnsubscribe,
      };

      // Shelving the selection, then packing the shelf: the tool runs
      // through the real execute route to real files on disk.
      fireEvent.click(screen.getByRole("button", { name: "Add to Shelf" }));
      await waitFor(() => {
        expect(
          fetchStub.calls.filter(
            (c) => c.url === "/api/extensions/execute" && (c.init?.method ?? "GET") === "POST",
          ).length,
        ).toBeGreaterThanOrEqual(1);
      });
      fireEvent.click(screen.getByRole("button", { name: "Shelf" }));
      expect(await screen.findByText(/sounds under review/i)).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Pack Shelf" }));

      const dialog = await screen.findByRole("dialog");
      fireEvent.click(within(dialog).getByRole("button", { name: "Choose" }));
      const destInput = within(dialog).getByPlaceholderText("/path/to/output/folder");
      await waitFor(() => {
        expect((destInput as HTMLInputElement).value).toBe(grant.path);
      });
      const packName = within(dialog).getByPlaceholderText("My Sound Pack");
      fireEvent.change(packName, { target: { value: "test-pack" } });
      fireEvent.click(within(dialog).getByRole("button", { name: /^make pack$/i }));

      await waitFor(
        () => {
          expect(screen.getByText(/2 sounds packed to/i)).toBeTruthy();
        },
        { timeout: 4000 },
      );
      expect(existsSync(`${grant.path}/test-pack.zip`)).toBe(true);
    } finally {
      scratch.dispose();
    }
  });

  it("fills and scrolls the workspace at 75%, 100% and 125% zoom", async () => {
    const scratch = createScratchLibrary("foleyard-layout-");
    try {
      const kickPath = scratch.writeFile("library/kick.wav");
      state.settings!.setLibraryRoots([scratch.root]);
      state.files!.batchUpsertFiles(
        [audioFileRecord({ path: kickPath, filename: "kick.wav" })],
        new Date().toISOString(),
      );
      const indexed = state.files!.getFiles({ limit: 10 });

      stubFetch(async (url: string) => {
        if (url === "/api/settings") {
          return { ok: true, json: async () => ({ libraryRoots: [scratch.root] }) };
        }
        if (url === "/api/scan") {
          return { ok: true, json: async () => ({ running: false }) };
        }
        if (url.startsWith("/api/files")) {
          return {
            ok: true,
            json: async () => ({
              files: indexed.map((row) => ({
                id: row.id,
                filename: row.filename,
                path: row.path,
                tags: [],
                isFavorite: false,
              })),
              hasMore: false,
              favoritesTotal: 0,
            }),
          };
        }
        if (url === "/api/extensions") {
          return { ok: true, json: async () => ({ extensions: [] }) };
        }
        if (url.startsWith("/api/waveform")) {
          return { ok: true, json: async () => ({ peaks: [0.2] }) };
        }
        return { ok: true, json: async () => ({}) };
      });

      const { container } = render(<Home />);
      await screen.findByText("kick.wav");

      // Percentage heights are zoom-invariant by construction; viewport units
      // are not. At every zoom the workspace root must fill (h-full, never
      // h-screen) and the file list must scroll (its scroll region intact).
      for (const zoom of [75, 100, 125]) {
        document.documentElement.style.zoom = `${zoom}%`;
        const html = container.innerHTML;
        expect(html, `no viewport heights at ${zoom}%`).not.toMatch(/h-screen|100v[hw]/);
        const workspace = container.querySelector(".foleyard-library-scroll");
        expect(workspace, `scroll region exists at ${zoom}%`).not.toBeNull();
        expect(
          workspace!.className,
          `list scrolls instead of growing the page at ${zoom}%`,
        ).toMatch(/overflow-y-auto/);
        const root = container.firstElementChild!;
        expect(root.className, `workspace fills at ${zoom}%`).toMatch(/h-full/);
      }
      document.documentElement.style.zoom = "";
    } finally {
      scratch.dispose();
    }
  });
});



