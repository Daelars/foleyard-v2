// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { V3AutoTagBoard } from "./auto-tag";

// Area: #230. The board mount issues the untagged coverage aggregate once and
// does not run member or origins scans until the user asks for them.

vi.mock("recharts", () => {
  const Box = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  const Empty = () => null;
  return {
    ResponsiveContainer: Box,
    AreaChart: Box,
    LineChart: Box,
    Area: Empty,
    Line: Empty,
    ReferenceLine: Empty,
    Tooltip: Empty,
    XAxis: Empty,
    YAxis: Empty,
  };
});

vi.mock("sonner", () => {
  const toast = Object.assign(() => {}, { success: () => {}, error: () => {} });
  return { toast };
});

type Call = { commandId: string; input: Record<string, unknown> };

const calls: Call[] = [];

function respond(commandId: string, input: Record<string, unknown>) {
  switch (commandId) {
    case "auto-tag-v2.coverage-summary":
      if (typeof input.tag === "string") {
        return {
          summary: JSON.stringify({
            total: 4,
            tagged: 1,
            tags: { thunder: 1 },
            members: [
              JSON.stringify({ id: "f1", filename: "rain.wav", tags: [] }),
            ],
            nextCursor: "",
          }),
        };
      }
      return {
        summary: JSON.stringify({
          total: 4,
          tagged: 1,
          tags: { thunder: 1 },
          allTags: ["thunder"],
          configuredRules: [],
        }),
      };
    case "auto-tag-v2.coverage-history":
      return { entries: [] };
    case "auto-tag-v2.latest-arrivals":
      return {};
    case "auto-tag-v2.list-candidates":
      return { words: [], lines: [], entries: [] };
    case "auto-tag-v2.clap-status":
      return {
        state: "not-downloaded",
        downloadedBytes: 0,
        totalBytes: 0,
        backendAvailable: false,
      };
    case "auto-tag-v2.list-origins":
      return {
        summary: JSON.stringify({
          total: 4,
          origins: { manual: 0, deterministic: 0, semantic_ai: 0 },
          matching: 0,
        }),
        entries: [],
        nextCursor: "",
      };
    default:
      return {};
  }
}

beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        commandId: string;
        input: Record<string, unknown>;
      };
      calls.push({ commandId: body.commandId, input: body.input ?? {} });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          outcome: { kind: "immediate", value: respond(body.commandId, body.input ?? {}) },
        }),
      } as unknown as Response;
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function Harness() {
  const [page, setPage] = useState<"coverage" | "origins">("coverage");
  return (
    <V3AutoTagBoard enabled page={page} onPageChange={setPage} />
  );
}

const count = (commandId: string) =>
  calls.filter((call) => call.commandId === commandId).length;

describe("V3AutoTagBoard loading", () => {
  it("fetches the untagged aggregate once on mount and no member scan", async () => {
    render(<Harness />);

    await screen.findByRole("tab", { name: "Coverage" });
    await waitFor(() => expect(count("auto-tag-v2.coverage-summary")).toBe(1));
    expect(
      calls.some(
        (call) =>
          call.commandId === "auto-tag-v2.coverage-summary" &&
          typeof call.input.tag === "string",
      ),
    ).toBe(false);
    expect(count("auto-tag-v2.list-candidates")).toBe(1);
    expect(count("auto-tag-v2.list-origins")).toBe(0);
  });

  it("fetches members only after a tag is selected", async () => {
    const { container } = render(<Harness />);

    await screen.findByRole("tab", { name: "Coverage" });
    await waitFor(() => expect(count("auto-tag-v2.coverage-summary")).toBe(1));

    const tagRow = container.querySelector('button[aria-pressed="true"]');
    expect(tagRow).toBeTruthy();
    fireEvent.click(tagRow!);

    await waitFor(() =>
      expect(
        calls.some(
          (call) =>
            call.commandId === "auto-tag-v2.coverage-summary" &&
            call.input.tag === "thunder",
        ),
      ).toBe(true),
    );
    expect(count("auto-tag-v2.coverage-summary")).toBe(2);
  });

  it("mounts the origins panel on first visit and reuses it afterwards", async () => {
    render(<Harness />);
    await screen.findByRole("tab", { name: "Coverage" });
    await waitFor(() => expect(count("auto-tag-v2.coverage-summary")).toBe(1));
    expect(count("auto-tag-v2.list-origins")).toBe(0);

    fireEvent.click(screen.getByRole("tab", { name: "Tag origins" }));
    await waitFor(() =>
      expect(count("auto-tag-v2.list-origins")).toBe(1),
    );

    fireEvent.click(screen.getByRole("tab", { name: "Coverage" }));
    fireEvent.click(screen.getByRole("tab", { name: "Tag origins" }));
    expect(count("auto-tag-v2.list-origins")).toBe(1);
  });
});
