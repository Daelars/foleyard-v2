// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { V3ExtensionsSection } from "@/app/(variant-i)/components/extensions/settings-section";
import { V3ToolsCards } from "@/app/(variant-i)/components/extensions/tools-cards";
import { V3SettingsDialog } from "@/app/(variant-i)/components/settings/settings-dialog";
import { invalidateV2ClientCaches } from "@/lib/extensions-v2/contributions";
import { invalidateV2EntriesCache } from "@/components/extensions-v2/use-v2-extension-entries";
import { emptyScanStatus } from "@/lib/scanner/types";

// Area: #295. Opening Settings must not mount and request every
// extension panel at once. One batched read serves the whole list; a
// single failing panel stays visible as a degraded entry, a total
// catalog failure stays visible and recoverable, and tab switches do not
// multiply requests.
const calls: Array<{ url: string; method: string }> = [];
let responder: ((url: string, init?: RequestInit) => Response | Promise<Response>) | null = null;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function entry(overrides: Record<string, unknown> = {}) {
  return {
    id: "make-pack-v2",
    name: "Make Pack v2",
    version: "1.0.0",
    description: "Export packs.",
    enabled: true,
    declaredPermissions: ["files:write"],
    effectivePermissions: ["files:write"],
    settings: [
      {
        declaration: {
          id: "copy-on-drop",
          label: "Copy on drop",
          description: "Copy files here instead of moving them.",
          type: "boolean",
          defaultValue: false,
        },
        value: false,
      },
    ],
    status: "ready",
    error: null,
    ...overrides,
  };
}

function catalogResponse(extensions: unknown[]): Response {
  return jsonResponse({
    ok: true,
    policyHealth: { degraded: false, reason: null },
    extensions,
  });
}

beforeEach(() => {
  calls.length = 0;
  responder = null;
  invalidateV2ClientCaches();
  invalidateV2EntriesCache();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      calls.push({ url, method: (init?.method ?? "GET").toUpperCase() });
      if (responder) return responder(url, init);
      return jsonResponse({ ok: false, error: { message: `unexpected ${url}` } }, 404);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("lazy extension settings loading (#295)", () => {
  it("loads every extension through one batched settings request", async () => {
    responder = () =>
      catalogResponse([
        entry(),
        entry({ id: "sound-shelf-v2", name: "Sound Shelf v2", settings: [] }),
      ]);

    render(<V3ExtensionsSection />);

    await waitFor(() => expect(screen.getByText("Make Pack v2")).toBeTruthy());
    await waitFor(() => expect(screen.getByText("Sound Shelf v2")).toBeTruthy());
    expect(calls.filter((call) => call.url === "/api/extensions-v2/settings")).toHaveLength(1);
  });

  it("keeps a failed extension visible as a degraded panel", async () => {
    responder = () =>
      catalogResponse([
        entry(),
        entry({
          id: "sound-shelf-v2",
          name: "Sound Shelf v2",
          status: "degraded",
          error: "Settings could not be read: database is locked",
          settings: [],
        }),
      ]);

    render(<V3ExtensionsSection />);

    await waitFor(() => expect(screen.getByText("Sound Shelf v2")).toBeTruthy());
    // The healthy panel still renders its control...
    expect(screen.getByRole("switch", { name: "Copy on drop" })).toBeTruthy();
    // ...and the failing panel is a visible degraded entry, not an empty one.
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("database is locked");
  });

  it("shows a recoverable error when the whole catalog fails", async () => {
    responder = () =>
      jsonResponse(
        { ok: false, error: { message: "Extension settings are unavailable." } },
        500,
      );

    render(<V3ToolsCards />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("unavailable");
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    await waitFor(() =>
      expect(calls.filter((call) => call.url === "/api/extensions-v2/settings").length).toBe(2),
    );
  });

  it("does not request extension settings until the Extensions tab opens", async () => {
    responder = () => catalogResponse([entry()]);

    render(
      <V3SettingsDialog
        open
        onOpenChange={() => {}}
        settings={{ libraryRoot: null, libraryRoots: [], stats: { activeFiles: 0, removedFiles: 0 } }}
        onSaveRoot={async () => {}}
        onRemoveRoot={async () => {}}
        scanStatus={emptyScanStatus}
        onStartScan={async () => {}}
        collections={[]}
        tags={[]}
        onCreateCollection={async () => null}
        onDeleteCollection={async () => {}}
        onCreateTag={async () => null}
        onDeleteTag={async () => {}}
        zoom={100}
        onUpdateZoom={() => {}}
        v2Settings={<V3ExtensionsSection />}
      />,
    );

    // The dialog opens on Library: no extension request has gone out.
    expect(screen.getByText("Settings")).toBeTruthy();
    expect(calls.filter((call) => call.url.startsWith("/api/extensions-v2/"))).toHaveLength(0);

    fireEvent.click(screen.getByRole("tab", { name: "Extensions" }));
    await waitFor(() => expect(screen.getByText("Make Pack v2")).toBeTruthy());
    expect(calls.filter((call) => call.url === "/api/extensions-v2/settings")).toHaveLength(1);

    // Switching away and back remounts the section but serves the cache: no new request.
    fireEvent.click(screen.getByRole("tab", { name: "Library & Storage" }));
    fireEvent.click(screen.getByRole("tab", { name: "Extensions" }));
    await waitFor(() => expect(screen.getByText("Make Pack v2")).toBeTruthy());
    expect(calls.filter((call) => call.url === "/api/extensions-v2/settings")).toHaveLength(1);
  });

  it("renders the dialog while the batched request is still pending", async () => {
    const pending: { release?: (response: Response) => void } = {};
    responder = (url) => {
      if (url === "/api/extensions-v2/settings") {
        return new Promise<Response>((resolve) => {
          pending.release = resolve;
        });
      }
      return jsonResponse({ ok: false, error: { message: `unexpected ${url}` } }, 404);
    };

    render(
      <V3SettingsDialog
        open
        onOpenChange={() => {}}
        settings={{ libraryRoot: null, libraryRoots: [], stats: { activeFiles: 0, removedFiles: 0 } }}
        onSaveRoot={async () => {}}
        onRemoveRoot={async () => {}}
        scanStatus={emptyScanStatus}
        onStartScan={async () => {}}
        collections={[]}
        tags={[]}
        onCreateCollection={async () => null}
        onDeleteCollection={async () => {}}
        onCreateTag={async () => null}
        onDeleteTag={async () => {}}
        zoom={100}
        onUpdateZoom={() => {}}
        v2Settings={<V3ExtensionsSection />}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Extensions" }));
    // The dialog chrome is present while the panel data is still loading.
    expect(screen.getByText("Settings")).toBeTruthy();
    expect(screen.getByText(/loading v2 extensions/i)).toBeTruthy();

    pending.release?.(catalogResponse([entry()]));
    await waitFor(() => expect(screen.getByText("Make Pack v2")).toBeTruthy());
  });
});
