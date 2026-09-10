// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { V2ToolsCards } from "./tools-cards";

// Area: extension v2 follow-up #175. The Tools grid cards mirror the v1
// `ExtensionCard` markup (monogram, name, version line, run button,
// info dialog, enable switch) with permissions/approval/settings in
// the details dialog.

function mockFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown) => {
      const target = String(url);
      if (target === "/api/extensions-v2/extensions") {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            extensions: [
              {
                id: "make-pack-v2",
                name: "Make Pack v2",
                version: "1.0.0",
                description: "Turn selected sounds into a clean folder or ZIP pack.",
                enabled: false,
              },
              {
                id: "folder-janitor-v2",
                name: "Folder Janitor v2",
                version: "1.0.0",
                description: "Find library mess.",
                enabled: true,
              },
              {
                id: "drop-rules-v2",
                name: "Drop Rules v2",
                version: "1.0.0",
                description: "Control what happens on drop.",
                enabled: false,
              },
            ],
          }),
        };
      }
      const settingsId = target.split("/api/extensions-v2/settings/")[1] ?? "";
      const isMakePack = settingsId === "make-pack-v2";
      return {
        ok: true,
        json: async () => ({
          ok: true,
          declaredPermissions: isMakePack ? ["library:read", "files:write"] : [],
          effectivePermissions: [],
          settings: isMakePack
            ? [
                {
                  declaration: {
                    id: "make-pack-v2.default-format",
                    label: "Default output format",
                    type: "enum",
                    defaultValue: "folder",
                    options: [
                      { label: "Folder", value: "folder" },
                      { label: "ZIP", value: "zip" },
                    ],
                  },
                  value: "folder",
                },
              ]
            : [],
        }),
      };
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("v2 tools cards", () => {
  it("renders a v1-style card, runs, toggles, and shows settings in the details dialog", async () => {
    mockFetch();
    const onRunExtension = vi.fn();
    render(<V2ToolsCards onRunExtension={onRunExtension} />);

    await waitFor(() => {
      expect(screen.getByText("Make Pack v2")).toBeTruthy();
    });
    // Monogram, version line, v2 marker — same shape as the v1 cards.
    expect(screen.getByText("MA")).toBeTruthy();
    expect(screen.getByText(/v1\.0\.0 · 1 settings · v2/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Make pack" }));
    expect(onRunExtension).toHaveBeenCalledTimes(1);
    expect(onRunExtension).toHaveBeenCalledWith("make-pack-v2");

    // Settings live in the details dialog, not inline in the grid.
    expect(screen.queryByText("library:read")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "View Make Pack v2 details" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("library:read")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Approve all" })).toBeTruthy();
    expect(within(dialog).getByText("Default output format")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Make pack" }));
    expect(onRunExtension).toHaveBeenCalledTimes(2);
    expect(onRunExtension).toHaveBeenCalledWith("make-pack-v2");
  });

  it("gives every dialog-owned extension a run button except drop rules", async () => {
    mockFetch();
    const onRunExtension = vi.fn();
    render(<V2ToolsCards onRunExtension={onRunExtension} />);

    await waitFor(() => {
      expect(screen.getByText("Folder Janitor v2")).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "Scan & clean" }));
    expect(onRunExtension).toHaveBeenCalledWith("folder-janitor-v2");

    // Drop Rules v2 documents its UI as the drop zone + settings: its
    // card renders with no run button (only Make pack + Scan & clean exist).
    expect(screen.getByText("Drop Rules v2")).toBeTruthy();
    const runButtons = screen
      .getAllByRole("button")
      .filter((button) => ["Make pack", "Scan & clean"].includes(button.textContent ?? ""));
    expect(runButtons).toHaveLength(2);
  });

  it("loads once and serves remounts from the cache without refetching", async () => {
    mockFetch();
    // Fresh module state: entries cached by any earlier test must not
    // leak in, or the first render would (correctly) fetch nothing.
    vi.resetModules();
    const { V2ToolsCards: FreshCards } = await import("./tools-cards");
    const fetchMock = vi.mocked(fetch);

    const first = render(<FreshCards onRunExtension={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText("Make Pack v2")).toBeTruthy();
    });
    const callsAfterFirstLoad = fetchMock.mock.calls.length;
    expect(callsAfterFirstLoad).toBeGreaterThan(0);
    first.unmount();

    // Remount with warm cache: renders instantly, zero new requests.
    render(<FreshCards onRunExtension={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText("Make Pack v2")).toBeTruthy();
    });
    expect(fetchMock.mock.calls.length).toBe(callsAfterFirstLoad);
  });
});
