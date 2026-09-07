// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  resolveV2PointContributions,
  toCatalogEntry,
  type ExtensionV2CatalogEntry,
  type V2PlanReview,
  type V2ResolvedContribution,
} from "@yard-core";
import {
  createSurfaceFixtureDefinition,
  createWorkerFixtureDefinition,
} from "@/lib/extensions-v2/fixtures";
import { V2PaletteSection } from "./palette";
import {
  V2ContextMenuItems,
  V2DropdownMenuItems,
  V2DropMenu,
  V2SelectionActions,
  V2Toolbar,
  screenV2DropAudio,
} from "./menus";
import { V2SidebarPanel } from "./sidebar";
import { V2ExtensionSettings } from "./settings";
import {
  V2FieldControls,
  V2JobProgress,
  V2PlanPreviewView,
  V2ResultDetails,
} from "./interaction";
import { ContextMenu, ContextMenuContent } from "@/components/ui/context-menu";
import { DropdownMenu, DropdownMenuContent } from "@/components/ui/dropdown-menu";

// Area: extension v2 R6 (#170). Interaction test per adapter: context
// changes and disable cleanup, through production resolution (catalog
// entry → resolveV2PointContributions → component). Fixture
// definitions prove unused points through the same adapters. Plain
// vitest assertions only (no jest-dom matchers in this repo).

function catalogEntries(): ExtensionV2CatalogEntry[] {
  return [
    toCatalogEntry(createSurfaceFixtureDefinition()),
    toCatalogEntry(createWorkerFixtureDefinition()),
  ];
}

function resolve(
  point: Parameters<typeof resolveV2PointContributions>[1],
  context: Parameters<typeof resolveV2PointContributions>[2],
  enabledIds: readonly string[] = ["fixture-surface", "fixture-worker"],
) {
  return resolveV2PointContributions(catalogEntries(), point, context, {
    isEnabled: (id) => enabledIds.includes(id),
    capabilities: { "desktop.native": true },
    grantedPermissions: (id) =>
      id === "fixture-surface"
        ? ["library:read", "files:read", "drop:read"]
        : ["library:read", "settings:read", "settings:write"],
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("v2 palette adapter", () => {
  it("invokes available entries, explains unavailable ones, and navigates by keyboard", () => {
    const onInvoke = vi.fn();
    const items = resolve("palette", { fileIds: [] });
    expect(items.length > 0).toBe(true);
    const { rerender } = render(<V2PaletteSection items={items} onInvoke={onInvoke} />);
    const available = items.filter((item) => item.availability.available);
    const unavailable = items.filter((item) => !item.availability.available);
    expect(unavailable.length > 0).toBe(true);
    for (const item of unavailable) {
      const button = screen.getByTitle(
        (item.availability as { reason: string }).reason,
      ) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
    }
    fireEvent.click(screen.getByRole("option", { name: new RegExp(available[0]!.title) }));
    expect(onInvoke).toHaveBeenCalledWith(available[0]);

    // Context change: selecting files enables the selection command.
    const withSelection = resolve("palette", { fileIds: ["file-1"] });
    rerender(<V2PaletteSection items={withSelection} onInvoke={onInvoke} />);
    const enabledItem = withSelection.find(
      (item) => item.commandId === "fixture-surface.inspect-selection",
    )!;
    expect(enabledItem.availability.available).toBe(true);
    const button = screen.getByRole("option", { name: /Inspect selection/ });
    button.focus();
    fireEvent.keyDown(button, { key: "ArrowDown" });
    expect(document.activeElement?.getAttribute("role")).toBe("option");

    // Disable cleanup: no enabled extensions, no entries.
    rerender(<V2PaletteSection items={[]} onInvoke={onInvoke} />);
    expect(screen.getByText("No extension commands match.")).toBeTruthy();
  });
});

describe("v2 context-menu adapters", () => {
  it("renders file-context items in order with validated selection context", () => {
    const onInvoke = vi.fn();
    const items = resolve("context-menu", { fileIds: ["file-1"] }).filter(
      (item) => item.contributionType === "file-context-menu",
    );
    expect(items).toHaveLength(1);
    render(
      <ContextMenu defaultOpen>
        <ContextMenuContent>
          <V2ContextMenuItems items={items} onInvoke={onInvoke} />
        </ContextMenuContent>
      </ContextMenu>,
    );
    fireEvent.click(screen.getByRole("menuitem", { name: /Inspect file/ }));
    expect(onInvoke).toHaveBeenCalledWith(items[0]);
  });

  it("renders folder-context items and disables them outside folder context", () => {
    const onInvoke = vi.fn();
    const inFolder = resolve("context-menu", { fileIds: [], folderPath: "/lib" }).filter(
      (item) => item.contributionType === "folder-context-menu",
    );
    expect(inFolder[0]!.availability.available).toBe(true);
    const outside = resolve("context-menu", { fileIds: [] }).filter(
      (item) => item.contributionType === "folder-context-menu",
    );
    expect(outside[0]!.availability.available).toBe(false);
    render(
      <DropdownMenu defaultOpen>
        <DropdownMenuContent>
          <V2DropdownMenuItems items={outside} onInvoke={onInvoke} />
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    const entry = screen.getByRole("menuitem", { name: /Inspect folder/ });
    expect(entry.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(entry);
    expect(onInvoke).not.toHaveBeenCalled();
  });
});

describe("v2 selection-actions adapter", () => {
  it("handles empty, ineligible, and eligible selections", () => {
    const onInvoke = vi.fn();
    const { rerender } = render(
      <V2SelectionActions items={[]} selectionCount={0} onInvoke={onInvoke} />,
    );
    expect(screen.getByText(/Select Library items/)).toBeTruthy();

    const eligible = resolve("selection-actions", { fileIds: ["a", "b"] });
    rerender(<V2SelectionActions items={eligible} selectionCount={2} onInvoke={onInvoke} />);
    fireEvent.click(screen.getByRole("button", { name: /Inspect selection/ }));
    expect(onInvoke).toHaveBeenCalledTimes(1);

    const withoutSelection = resolve("selection-actions", { fileIds: [] });
    rerender(
      <V2SelectionActions items={withoutSelection} selectionCount={0} onInvoke={onInvoke} />,
    );
    expect(screen.getByText(/Select Library items/)).toBeTruthy();
  });
});

describe("v2 toolbar adapter", () => {
  it("places commands declaratively and removes them on disable", () => {
    const onInvoke = vi.fn();
    const items = resolve("toolbar", { fileIds: [] });
    expect(items.length > 0).toBe(true);
    const { rerender } = render(
      <V2Toolbar items={items} onInvoke={onInvoke} label="Extension toolbar" />,
    );
    const toolbar = screen.getByRole("toolbar", { name: "Extension toolbar" });
    expect(within(toolbar).getAllByRole("button").length).toBe(items.length);
    fireEvent.click(screen.getByRole("button", { name: /Ping/ }));
    expect(onInvoke).toHaveBeenCalledWith(
      expect.objectContaining({ key: "v2:fixture-surface:fixture-surface.toolbar-ping" }),
    );

    rerender(<V2Toolbar items={[]} onInvoke={onInvoke} />);
    expect(screen.queryByRole("toolbar", { name: "Extension toolbar" })).toBeNull();
  });
});

describe("v2 sidebar adapter", () => {
  const panelItems = (items: V2ResolvedContribution[]) =>
    items.map((item) => ({ item, subtitle: item.extensionName }));

  it("covers loading, error with retry, empty, and item actions", () => {
    const onInvoke = vi.fn();
    const onRetry = vi.fn();
    const items = resolve("sidebar", { fileIds: [] });
    const { rerender } = render(
      <V2SidebarPanel
        title="Recent pings"
        panelItems={panelItems(items)}
        state={{ status: "loading" }}
        onInvoke={onInvoke}
      />,
    );
    expect(screen.getByLabelText("Loading")).toBeTruthy();

    rerender(
      <V2SidebarPanel
        title="Recent pings"
        panelItems={[]}
        state={{ status: "error", message: "Sidebar source failed." }}
        onInvoke={onInvoke}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByRole("alert").textContent).toMatch("Sidebar source failed.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);

    rerender(
      <V2SidebarPanel
        title="Recent pings"
        panelItems={[]}
        state={{ status: "ready" }}
        onInvoke={onInvoke}
        emptyHint="No pings yet."
      />,
    );
    expect(screen.getByText("No pings yet.")).toBeTruthy();

    rerender(
      <V2SidebarPanel
        title="Recent pings"
        panelItems={panelItems(items)}
        state={{ status: "ready" }}
        onInvoke={onInvoke}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Recent pings/ }));
    expect(onInvoke).toHaveBeenCalledWith(items[0]);
  });
});

describe("v2 settings adapter", () => {
  const entry = {
    id: "fixture-surface",
    name: "Fixture Surface",
    version: "0.1.0",
    description: "Surface fixture.",
    enabled: true,
    declaredPermissions: ["library:read", "files:read", "drop:read", "desktop:open"],
    effectivePermissions: ["library:read", "files:read", "drop:read"],
    rows: [
      {
        declaration: createSurfaceFixtureDefinition().settings![0]!,
        value: "fixture",
      },
      {
        declaration: createSurfaceFixtureDefinition().settings![1]!,
        value: false,
      },
    ],
  };

  it("validates controls, resets, toggles enablement, and explains permissions", () => {
    const onToggle = vi.fn();
    const onUpdate = vi.fn();
    const onReset = vi.fn();
    const { rerender } = render(
      <V2ExtensionSettings
        entries={[entry]}
        onToggle={onToggle}
        onUpdateSetting={onUpdate}
        onReset={onReset}
      />,
    );
    expect(screen.getByText("desktop:open")).toBeTruthy();
    expect(screen.getByText(/1 declared permission\(s\) not granted/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(onReset).toHaveBeenCalledWith("fixture-surface");

    fireEvent.click(screen.getByRole("switch", { name: "Disable Fixture Surface" }));
    expect(onToggle).toHaveBeenCalledWith("fixture-surface", false);

    const text = screen.getByLabelText("Note prefix");
    fireEvent.change(text, { target: { value: "ok" } });
    fireEvent.blur(text);
    expect(onUpdate).toHaveBeenCalledWith("fixture-surface", "fixture-surface.note-prefix", "ok");

    rerender(
      <V2ExtensionSettings
        entries={[{ ...entry, enabled: false }]}
        onToggle={onToggle}
        onUpdateSetting={onUpdate}
        onReset={onReset}
      />,
    );
    expect((screen.getByLabelText("Note prefix") as HTMLInputElement).disabled).toBe(true);
  });
});

describe("v2 drop-menu adapter", () => {
  const dropItems = () => resolve("drop-menu", { fileIds: [] });

  it("screens audio extensions and offers validated drop commands", () => {
    expect(screenV2DropAudio(["kick.wav", "cover.png", "loop.MP3"])).toEqual({
      audio: ["kick.wav", "loop.MP3"],
      skipped: 1,
    });
    const onInvoke = vi.fn();
    render(
      <V2DropMenu items={dropItems()} onInvoke={onInvoke}>
        <div data-testid="workspace">workspace</div>
      </V2DropMenu>,
    );
    const zone = screen.getByTestId("workspace").parentElement!;
    fireEvent.dragEnter(zone, { dataTransfer: { types: ["Files"] } });
    expect(
      screen.getByRole("menu", { name: "Drop sounds for extension actions" }),
    ).toBeTruthy();

    fireEvent.drop(zone, {
      dataTransfer: { files: [new File(["x"], "kick.wav"), new File(["y"], "cover.png")] },
    });
    const menu = screen.getByRole("menu", { name: "Extension drop actions" });
    expect(menu.textContent).toMatch("1 non-audio item(s) ignored.");
    fireEvent.click(within(menu).getByRole("button", { name: /Inspect drop/ }));
    expect(onInvoke).toHaveBeenCalledWith(
      expect.objectContaining({ audioCount: 1, skipped: 1 }),
    );
  });

  it("rejects drops without audio and dismisses with Escape", () => {
    const onInvoke = vi.fn();
    render(
      <V2DropMenu items={dropItems()} onInvoke={onInvoke}>
        <div data-testid="workspace">workspace</div>
      </V2DropMenu>,
    );
    const zone = screen.getByTestId("workspace").parentElement!;
    fireEvent.dragEnter(zone, { dataTransfer: { types: ["Files"] } });
    fireEvent.keyDown(zone, { key: "Escape" });
    expect(
      screen.queryByRole("menu", { name: "Drop sounds for extension actions" }),
    ).toBeNull();

    fireEvent.dragEnter(zone, { dataTransfer: { types: ["Files"] } });
    fireEvent.drop(zone, { dataTransfer: { files: [new File(["y"], "cover.png")] } });
    expect(
      screen.getByRole("menu", { name: "Extension drop actions" }).textContent,
    ).toMatch(/No audio files/);
    expect(onInvoke).not.toHaveBeenCalled();
  });
});

describe("v2 interaction adapters", () => {
  it("renders generic fields with inline validation errors", () => {
    const onChange = vi.fn();
    render(
      <V2FieldControls
        schema={{
          kind: "object",
          properties: {
            note: { kind: "string", minLength: 3 },
            loud: { kind: "boolean", default: false },
          },
          required: ["note"],
        }}
        values={{ note: "ok-length", loud: false }}
        onChange={onChange}
      />,
    );
    const input = screen.getByLabelText(/note/);
    fireEvent.change(input, { target: { value: "no" } });
    expect(screen.getByRole("alert").textContent).toMatch(/at least 3/);
    expect(onChange).toHaveBeenCalledWith({ note: "no", loud: false });
  });

  it("renders the reviewed plan payload with tables, notices, details, and apply", () => {
    const onApply = vi.fn();
    const review: V2PlanReview = {
      planId: "vplan_1",
      extensionId: "fixture-surface",
      commandId: "fixture-surface.ping",
      summary: "Ping once",
      tables: [{ id: "targets", title: "Targets", columns: ["File"], rows: [["kick.wav"]] }],
      notices: [{ tone: "warning", message: "Loud ping." }],
      details: { format: "folder" },
      targets: { fileIds: [] },
      options: null,
      destructive: false,
      reversibility: "job-temp-cleanup",
      reversibilityNote: "Temporary output only.",
      createdAt: "2026-09-06T00:00:00.000Z",
      expiresAt: "2026-09-06T00:15:00.000Z",
      reviewedAt: "2026-09-06T00:01:00.000Z",
    };
    render(<V2PlanPreviewView review={review} onApply={onApply} />);
    expect(screen.getByText("Ping once")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toMatch("Loud ping.");
    expect(screen.getByRole("columnheader", { name: "File" })).toBeTruthy();
    expect(screen.getByText("kick.wav")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Apply plan" }));
    expect(onApply).toHaveBeenCalledWith(review);
  });

  it("polls job status to settlement and renders result details", async () => {
    const running = {
      jobId: "vjob_1",
      invocationId: "vinv_1",
      extensionId: "fixture-worker",
      commandId: "fixture-worker.count-library",
      state: "running",
      createdAt: "2026-09-06T00:00:00.000Z",
      progress: { completed: 1, total: 4, updatedAt: "2026-09-06T00:00:01.000Z" },
      partial: { succeeded: 1, failed: [], incomplete: false },
      outputs: [],
    };
    const done = {
      ...running,
      state: "succeeded",
      progress: { completed: 4, total: 4, updatedAt: "2026-09-06T00:00:02.000Z" },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ job: running }),
      })
      .mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ job: done }),
      });
    vi.stubGlobal("fetch", fetchMock);
    const onSettled = vi.fn();
    render(<V2JobProgress jobId="vjob_1" onSettled={onSettled} />);
    await waitFor(
      () => expect(screen.getByLabelText(/succeeded/)).toBeTruthy(),
      { timeout: 5000 },
    );
    expect(onSettled).toHaveBeenCalledWith(expect.objectContaining({ state: "succeeded" }));
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("100");
  });

  it("renders typed result values without executable content", () => {
    const { rerender } = render(<V2ResultDetails value={{ copied: 3, failed: [] }} />);
    expect(screen.getByText(/"copied": 3/)).toBeTruthy();
    rerender(<V2ResultDetails value={null} />);
    expect(screen.getByText("No result details.")).toBeTruthy();
  });
});
