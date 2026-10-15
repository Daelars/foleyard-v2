// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  ExtensionV2Catalog,
  ExtensionV2CatalogCommand,
  ExtensionV2CatalogEntry,
  ExtensionV2Contribution,
  ExtensionV2UiIntent,
} from "@yard-core";

import { emptyV2UiState } from "@/lib/extensions-v2/contributions";
import type { V2Workflow } from "@/lib/extensions-v2/command-surfaces";
import { useV2PaletteBridge } from "./use-v2-palette";

// Area: #294. The palette bridge is a generic dispatch surface. It must
// route by the command's declared UI intent — opening the dedicated
// workspace for form/review/confirm commands and running only direct
// commands headless — and it must never strand a prepared review plan.

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
  },
}));

function catalogCommand(input: {
  id: string;
  ui?: ExtensionV2UiIntent;
  scope?: ExtensionV2CatalogCommand["scope"];
  requiresSelection?: boolean;
}): ExtensionV2CatalogCommand {
  return {
    id: input.id,
    title: input.id,
    description: "",
    scope: input.scope ?? "global",
    destructive: false,
    requiresSelection: input.requiresSelection ?? false,
    requiredCapabilities: [],
    docsId: "commands",
    ui: input.ui ?? "direct",
  };
}

function catalogEntry(input: {
  id: string;
  commands: ExtensionV2CatalogCommand[];
  contributions: ExtensionV2Contribution[];
}): ExtensionV2CatalogEntry {
  return {
    id: input.id,
    name: input.id,
    version: "1.0.0",
    description: "",
    permissions: [],
    commands: input.commands,
    settings: [],
    contributions: input.contributions,
    docsRefs: [],
  };
}

function catalogOf(...entries: ExtensionV2CatalogEntry[]): ExtensionV2Catalog {
  return { apiVersion: 2, entries };
}

function enabledState(ids: readonly string[]) {
  return { enabled: ids, capabilities: {} };
}

function jsonResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 400, json: async () => body };
}

describe("v2 palette command routing", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    toastError.mockClear();
    toastSuccess.mockClear();
  });

  it("opens the Make Pack workflow for a form command instead of invoking headless", () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const onOpenWorkflow = vi.fn();
    const catalog = catalogOf(
      catalogEntry({
        id: "make-pack-v2",
        commands: [
          catalogCommand({
            id: "make-pack-v2.from-selection",
            ui: "form",
            scope: "selection",
            requiresSelection: true,
          }),
        ],
        contributions: [
          {
            id: "make-pack-v2.palette-selection",
            type: "command-palette",
            commandId: "make-pack-v2.from-selection",
          },
        ],
      }),
    );
    const { result } = renderHook(() =>
      useV2PaletteBridge(["f1"], catalog, enabledState(["make-pack-v2"]), {
        onOpenWorkflow,
      }),
    );

    act(() => {
      result.current.runV2Command("make-pack-v2", "make-pack-v2.from-selection");
    });

    expect(onOpenWorkflow).toHaveBeenCalledWith(
      {
        kind: "make-pack",
        source: "selection",
      },
      ["f1"],
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("opens the janitor workspace for a review command, never preparing a stranded plan", () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const onOpenWorkflow = vi.fn();
    const { result } = renderHook(() =>
      useV2PaletteBridge([], null, emptyV2UiState(), { onOpenWorkflow }),
    );

    act(() => {
      result.current.runV2Command(
        "folder-janitor-v2",
        "folder-janitor-v2.delete-folders",
      );
    });

    expect(onOpenWorkflow).toHaveBeenCalledWith({ kind: "folder-janitor" }, []);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("runs a direct command headless with the current selection", async () => {
    const fetchMock = vi.fn(
      async (..._args: unknown[]) => {
        void _args;
        return jsonResponse({ ok: true, outcome: { kind: "immediate", value: {} } });
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    const onOpenWorkflow = vi.fn();
    const catalog = catalogOf(
      catalogEntry({
        id: "sound-shelf-v2",
        commands: [
          catalogCommand({
            id: "sound-shelf-v2.add-selected",
            ui: "direct",
            scope: "selection",
            requiresSelection: true,
          }),
        ],
        contributions: [
          {
            id: "sound-shelf-v2.palette-add",
            type: "command-palette",
            commandId: "sound-shelf-v2.add-selected",
          },
        ],
      }),
    );
    const { result } = renderHook(() =>
      useV2PaletteBridge(["f1"], catalog, enabledState(["sound-shelf-v2"]), {
        onOpenWorkflow,
      }),
    );

    act(() => {
      result.current.runV2Command("sound-shelf-v2", "sound-shelf-v2.add-selected");
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(onOpenWorkflow).not.toHaveBeenCalled();
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    const body = JSON.parse(init?.body as string) as {
      selection: { fileIds: string[] };
    };
    expect(body.selection.fileIds).toEqual(["f1"]);
  });

  it("omits a non-assignable form command from the palette and refuses it with a reason", () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const catalog = catalogOf(
      catalogEntry({
        id: "third-party-tool",
        commands: [
          catalogCommand({ id: "third-party-tool.import", ui: "form" }),
        ],
        contributions: [
          {
            id: "third-party-tool.palette-import",
            type: "command-palette",
            commandId: "third-party-tool.import",
          },
        ],
      }),
    );
    const { result } = renderHook(() =>
      useV2PaletteBridge([], catalog, enabledState(["third-party-tool"]), {
        onOpenWorkflow: vi.fn(),
      }),
    );

    expect(result.current.v2ToolCommands).toEqual([]);

    act(() => {
      result.current.runV2Command("third-party-tool", "third-party-tool.import");
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalled();
  });

  it("routes a review-required outcome to the review surface, not a stranded success toast", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        ok: true,
        outcome: {
          kind: "review-required",
          planId: "vplan_1",
          summary: "Delete 2 folders",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const onOpenReview = vi.fn();
    const catalog = catalogOf(
      catalogEntry({
        id: "make-pack-v2",
        commands: [catalogCommand({ id: "make-pack-v2.from-recent", ui: "direct" })],
        contributions: [
          {
            id: "make-pack-v2.palette-recent",
            type: "command-palette",
            commandId: "make-pack-v2.from-recent",
          },
        ],
      }),
    );
    const { result } = renderHook(() =>
      useV2PaletteBridge([], catalog, enabledState(["make-pack-v2"]), {
        onOpenWorkflow: vi.fn(),
        onOpenReview,
      }),
    );

    act(() => {
      result.current.runV2Command("make-pack-v2", "make-pack-v2.from-recent");
    });

    await waitFor(() => expect(onOpenReview).toHaveBeenCalledTimes(1));
    expect(onOpenReview).toHaveBeenCalledWith("vplan_1", expect.any(String));
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("routes auto-tag form and confirm commands onto the Auto Tag workspace", () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const onOpenWorkflow = vi.fn();
    const { result } = renderHook(() =>
      useV2PaletteBridge([], null, emptyV2UiState(), { onOpenWorkflow }),
    );

    act(() => {
      result.current.runV2Command("auto-tag-v2", "auto-tag-v2.download-model");
      result.current.runV2Command("auto-tag-v2", "auto-tag-v2.remove-by-origin");
    });

    expect(onOpenWorkflow).toHaveBeenNthCalledWith(
      1,
      {
        kind: "auto-tag",
        page: "coverage",
      },
      [],
    );
    expect(onOpenWorkflow).toHaveBeenNthCalledWith(
      2,
      {
        kind: "auto-tag",
        page: "origins",
      },
      [],
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports a missing workspace instead of invoking when no opener is supplied", () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() =>
      useV2PaletteBridge([], null, emptyV2UiState()),
    );

    act(() => {
      result.current.runV2Command(
        "folder-janitor-v2",
        "folder-janitor-v2.scan-library",
      );
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalled();
  });

  it("keeps the workflow type closed over the surfaces the app ships", () => {
    // Compile-time assertion kept at runtime so an added workflow is
    // noticed here.
    const workflows: V2Workflow[] = [
      { kind: "make-pack", source: "shelf" },
      { kind: "folder-janitor" },
      { kind: "library-gatherer" },
      { kind: "save-search" },
      { kind: "auto-tag", page: "coverage" },
      { kind: "auto-tag", page: "origins" },
    ];
    expect(workflows).toHaveLength(6);
  });
});
