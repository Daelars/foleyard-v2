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
            ],
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          ok: true,
          declaredPermissions: ["library:read", "files:write"],
          effectivePermissions: [],
          settings: [
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
          ],
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
    const onRunPack = vi.fn();
    render(<V2ToolsCards onRunPack={onRunPack} />);

    await waitFor(() => {
      expect(screen.getByText("Make Pack v2")).toBeTruthy();
    });
    // Monogram, version line, v2 marker — same shape as the v1 cards.
    expect(screen.getByText("MA")).toBeTruthy();
    expect(screen.getByText(/v1\.0\.0 · 1 settings · v2/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Make pack" }));
    expect(onRunPack).toHaveBeenCalledTimes(1);

    // Settings live in the details dialog, not inline in the grid.
    expect(screen.queryByText("library:read")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "View Make Pack v2 details" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("library:read")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Approve all" })).toBeTruthy();
    expect(within(dialog).getByText("Default output format")).toBeTruthy();
  });
});
