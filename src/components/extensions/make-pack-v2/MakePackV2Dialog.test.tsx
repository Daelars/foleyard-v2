// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MakePackV2Dialog } from "./MakePackV2Dialog";

// Area: extension v2 R8 (#171). Make Pack v2 dialog through mocked
// transport: validation, preview rendering, destination gating,
// job start, and capability-aware results. The engine paths run in
// the package and app integration suites; this proves the renderer
// sequences the endpoints.

function mockTransport() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status });
    if (url === "/api/extensions-v2/execute") {
      return json({
        ok: true,
        outcome: { kind: "review-required", planId: "vplan_1", invocationId: "vinv_1" },
      });
    }
    if (url === "/api/extensions-v2/plans/vplan_1") {
      return json({
        ok: true,
        review: {
          planId: "vplan_1",
          summary: 'Pack 2 sounds as folder "Selected Sounds Pack"',
          tables: [
            {
              id: "sources",
              title: "Sources",
              columns: ["Sound", "Pack name", "Status"],
              rows: [
                ["a.wav", "a.wav", "ready"],
                ["b.wav", "b.wav", "ready"],
              ],
            },
          ],
          notices: [{ tone: "info", message: "Existing destination files are never overwritten." }],
          details: {},
          targets: { fileIds: ["a", "b"] },
          options: {},
          reversibility: "irreversible-files",
          reversibilityNote: "Finished packs stay.",
          reviewedAt: "2026-09-06T00:00:00.000Z",
        },
      });
    }
    if (url === "/api/extensions-v2/grants") {
      return json({ ok: true, grantId: "grant-1", path: "/tmp/out" });
    }
    if (url === "/api/extensions-v2/jobs" && init?.method === "POST") {
      return json({
        ok: true,
        outcome: { kind: "job", jobId: "vjob_1", state: "running", invocationId: "vinv_2" },
      });
    }
    if (url === "/api/extensions-v2/jobs/vjob_1") {
      return json({
        ok: true,
        job: {
          jobId: "vjob_1",
          invocationId: "vinv_2",
          extensionId: "make-pack-v2",
          commandId: "make-pack-v2.from-selection",
          state: "succeeded",
          createdAt: "2026-09-06T00:00:00.000Z",
          progress: { completed: 2, total: 2, updatedAt: "2026-09-06T00:00:00.000Z" },
          partial: { succeeded: 2, failed: [], incomplete: false },
          outputs: ["/tmp/out"],
          value: {
            packName: "Selected Sounds Pack",
            outputFormat: "folder",
            outputPath: "/tmp/out",
            copied: 2,
            skipped: [],
            missing: [],
            failedFiles: [],
            failedReasons: [],
            manifestIncluded: true,
            revealCapability: "desktop:reveal",
          },
        },
      });
    }
    return json({ ok: false, error: { message: `unexpected ${url}` } }, 500);
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (window as { desktopBridge?: unknown }).desktopBridge;
});

describe("MakePackV2Dialog", () => {
  it("requires a selection for the selection source", () => {
    vi.stubGlobal("fetch", mockTransport());
    render(<MakePackV2Dialog open onOpenChange={() => {}} initialSource="selection" initialFileIds={[]} />);
    expect(screen.getByRole("alert").textContent).toMatch(/at least one sound/);
    expect(screen.getByRole("button", { name: /Preview pack/ })).toBeTruthy();
  });

  it("previews, gates the job on a destination, then shows results with reveal", async () => {
    const fetchMock = mockTransport();
    vi.stubGlobal("fetch", fetchMock);
    (window as { desktopBridge?: unknown }).desktopBridge = {
      isDesktop: true,
      pickFolder: async () => ({ ok: true, path: "/tmp/out" }),
      revealPath: async () => ({ ok: true }),
    };
    render(
      <MakePackV2Dialog open onOpenChange={() => {}} initialSource="selection" initialFileIds={["a", "b"]} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Preview pack/ }));
    await waitFor(() => {
      expect(screen.getByText(/Pack 2 sounds as folder/)).toBeTruthy();
    });
    expect(screen.getAllByText("a.wav").length).toBeGreaterThan(0);
    expect(screen.getByText(/never overwritten/)).toBeTruthy();

    // No destination yet: the Pack button explains why it is disabled.
    const gated = screen.getByRole("button", { name: /Pack \(2\)/ }) as HTMLButtonElement;
    expect(gated.disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Choose" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Pack \(2\)/ }) as HTMLButtonElement).toBeTruthy();
    });
    const start = screen.getByRole("button", { name: /Pack \(2\)/ }) as HTMLButtonElement;
    expect(start.disabled).toBe(false);
    fireEvent.click(start);

    await waitFor(() => {
      expect(screen.getByText(/Packed 2 sounds/)).toBeTruthy();
    });
    expect(screen.getByText(/manifest\.json included/)).toBeTruthy();
    const reveal = screen.getByRole("button", { name: /Open destination/ }) as HTMLButtonElement;
    expect(reveal.disabled).toBe(false);

    const called = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(called).toContain("/api/extensions-v2/execute");
    expect(called).toContain("/api/extensions-v2/grants");
    expect(called).toContain("/api/extensions-v2/jobs");
  });

  it("explains the missing desktop capability for picker and reveal", () => {
    vi.stubGlobal("fetch", mockTransport());
    render(
      <MakePackV2Dialog open onOpenChange={() => {}} initialSource="shelf" initialFileIds={[]} />,
    );
    expect(screen.getByText(/picker requires the desktop app/)).toBeTruthy();
  });
});
