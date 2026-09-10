// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AutoTagBoard } from "./board";

// Area: extension page (#197). The board renders live endpoint data:
// coverage from the files API, the queue from list-candidates, and
// promote/dismiss/tag actions round-trip through the execute route.
const FILES = [
  {
    id: "f1",
    filename: "thunder-close_take01.wav",
    tags: [{ id: "t1", name: "thunder", origin: "deterministic", confidence: null }],
  },
  { id: "f2", filename: "paper-bag_crumple_fast.wav", tags: [] },
];

function stubFetch(calls: Array<{ url: string; init?: RequestInit }>) {
  const impl = async (url: string, init?: RequestInit): Promise<Response> => {
    calls.push({ url, init });
    const body = init?.body ? (JSON.parse(init.body as string) as { commandId?: string }) : {};
    if (url.startsWith("/api/files")) {
      return Response.json({ files: FILES, hasMore: false });
    }
    if (url === "/api/extensions-v2/execute") {
      if (body.commandId === "auto-tag-v2.list-candidates") {
        return Response.json({
          ok: true,
          outcome: {
            kind: "immediate",
            value: { words: ["paper"], lines: ["paper — 1 file, e.g. paper-bag_crumple_fast.wav"] },
          },
        });
      }
      if (body.commandId === "auto-tag-v2.clap-status") {
        return Response.json({
          ok: true,
          outcome: {
            kind: "immediate",
            value: {
              modelId: "m",
              state: "not-downloaded",
              downloadedBytes: 0,
              totalBytes: 400,
              backendAvailable: false,
            },
          },
        });
      }
      return Response.json({ ok: true, outcome: { kind: "immediate", value: {} } });
    }
    return Response.json({}, { status: 404 });
  };
  vi.stubGlobal("fetch", impl);
}

describe("AutoTagBoard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("prompts to enable when the tool is off without fetching", async () => {
    const calls: Array<{ url: string }> = [];
    stubFetch(calls);
    render(<AutoTagBoard enabled={false} />);
    expect(screen.getByText("Auto tag is off")).toBeTruthy();
    expect(calls).toEqual([]);
  });

  it("renders coverage, queue, and untagged files from live data", async () => {
    const calls: Array<{ url: string }> = [];
    stubFetch(calls);
    render(<AutoTagBoard enabled />);
    await waitFor(() => {
      expect(screen.getByText("1/2 tagged · 1 to go")).toBeTruthy();
    });
    expect(screen.getByText("paper — 1 file, e.g. paper-bag_crumple_fast.wav")).toBeTruthy();
    expect(screen.getByText("paper-bag_crumple_fast.wav")).toBeTruthy();
  });

  it("promotes a candidate through the execute route", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    stubFetch(calls);
    render(<AutoTagBoard enabled />);
    await waitFor(() => {
      expect(screen.getByText("Promote")).toBeTruthy();
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Promote"));
    });
    const promote = calls.find((call) =>
      (call.init?.body as string | undefined)?.includes("auto-tag-v2.promote-candidate"),
    );
    expect(promote).toBeTruthy();
    expect(promote!.init!.body as string).toContain('"paper"');
  });
});
