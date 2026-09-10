// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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
    if (url === "/api/extensions-v2/execute") {
      if (body.commandId === "auto-tag-v2.coverage-summary") {
        return Response.json({ ok: true, outcome: { kind: "immediate", value: {
          summary: JSON.stringify({ total: 2, tagged: 1, tags: { thunder: 1 }, allTags: ["thunder"], configuredRules: [], members: [] }),
        } } });
      }
      if (body.commandId === "auto-tag-v2.coverage-history") {
        return Response.json({ ok: true, outcome: { kind: "immediate", value: { entries: [] } } });
      }
      if (body.commandId === "auto-tag-v2.latest-arrivals") {
        return Response.json({ ok: true, outcome: { kind: "immediate", value: {
          hasData: true, batch: JSON.stringify({ files: FILES }),
        } } });
      }
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
      if (body.commandId === "auto-tag-v2.list-origins") {
        return Response.json({ ok: true, outcome: { kind: "immediate", value: {
          summary: JSON.stringify({ total: 2, matching: 2, origins: { manual: 1, deterministic: 1, semantic_ai: 1 } }),
          entries: [JSON.stringify({ id: "f1", filename: "mixed.wav", tags: [
            { id: "m", name: "impact", origin: "manual", confidence: null },
            { id: "d", name: "metal", origin: "deterministic", confidence: null },
            { id: "a", name: "bright", origin: "semantic_ai", confidence: 0.84 },
          ], firedRules: [{ token: "metal", tags: ["metal"] }] })], nextCursor: "",
        } } });
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

  it("does not import prototype implementation or mock data", () => {
    const source = ["board.tsx", "origins.tsx"]
      .map((name) => readFileSync(join(process.cwd(), "src/components/AutoTagBoard", name), "utf8"))
      .join("\n");
    expect(source).not.toMatch(/from ["'][^"']*prototype\//);
    expect(source).not.toMatch(/mock-(data|history|files)/i);
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
    expect(screen.getByText("no rule fired")).toBeTruthy();
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

  it("switches between Coverage and Tag origins while preserving origin marks", async () => {
    stubFetch([]);
    function Harness() {
      const [page, setPage] = useState<"coverage" | "origins">("coverage");
      return <AutoTagBoard enabled page={page} onPageChange={setPage} />;
    }
    render(<Harness />);
    await waitFor(() => expect(screen.getByText("Candidate queue")).toBeTruthy());
    fireEvent.click(screen.getByRole("tab", { name: "Tag origins" }));
    await waitFor(() => expect(screen.getByText("mixed.wav")).toBeTruthy());
    expect(screen.getByTitle("Added by hand").textContent).toBe("M");
    expect(screen.getByTitle("Fired by a filename rule").textContent).toBe("D");
    expect(screen.getByTitle(/Suggested automatically/).textContent).toBe("AI 0.84");
  });

  it("dismisses a candidate from the origins-tab queue through the execute route", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    stubFetch(calls);
    function Harness() {
      const [page, setPage] = useState<"coverage" | "origins">("coverage");
      return <AutoTagBoard enabled page={page} onPageChange={setPage} />;
    }
    render(<Harness />);
    await waitFor(() => expect(screen.getByText("Candidate queue")).toBeTruthy());
    fireEvent.click(screen.getByRole("tab", { name: "Tag origins" }));
    await waitFor(() => {
      expect(screen.getByText("Promote to tag")).toBeTruthy();
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Dismiss"));
    });
    const dismiss = calls.find((call) =>
      (call.init?.body as string | undefined)?.includes("auto-tag-v2.dismiss-candidate"),
    );
    expect(dismiss).toBeTruthy();
    expect(dismiss!.init!.body as string).toContain('"paper"');
  });

  it("does not record coverage merely by opening the page", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    stubFetch(calls);
    render(<AutoTagBoard enabled />);
    await waitFor(() => expect(screen.getByText("Candidate queue")).toBeTruthy());
    expect(calls.some((call) => (call.init?.body as string | undefined)?.includes("record-coverage"))).toBe(false);
  });

  it("shows command failures instead of an empty board", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ ok: false, error: { message: "permission missing" } }, { status: 403 }));
    render(<AutoTagBoard enabled />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByText("permission missing")).toBeTruthy();
  });

  it("shows live progress while a semantic job runs", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    stubFetch(calls);
    const baseFetch = globalThis.fetch;
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit): Promise<Response> => {
      if (url === "/api/extensions-v2/jobs" && init?.method === "POST") {
        calls.push({ url, init });
        return Response.json(
          { ok: true, outcome: { kind: "job", jobId: "vjob_1", state: "queued" } },
          { status: 202 },
        );
      }
      if (url === "/api/extensions-v2/jobs/vjob_1") {
        return Response.json({
          ok: true,
          job: { jobId: "vjob_1", state: "running", progress: { completed: 1, total: 2 } },
        });
      }
      if (url === "/api/extensions-v2/execute") {
        const body = init?.body ? (JSON.parse(init.body as string) as { commandId?: string }) : {};
        if (body.commandId === "auto-tag-v2.clap-status") {
          return Response.json({
            ok: true,
            outcome: {
              kind: "immediate",
              value: {
                modelId: "m",
                state: "ready",
                downloadedBytes: 400,
                totalBytes: 400,
                backendAvailable: true,
              },
            },
          });
        }
        if (body.commandId === "auto-tag-v2.list-origins") {
          return Response.json({
            ok: true,
            outcome: {
              kind: "immediate",
              value: {
                summary: JSON.stringify({ total: 2, matching: 2, origins: { manual: 0, deterministic: 0, semantic_ai: 0 } }),
                entries: [JSON.stringify({ id: "u1", filename: "hum.wav", tags: [], firedRules: [] })],
                nextCursor: "",
              },
            },
          });
        }
      }
      return (baseFetch as (url: string, init?: RequestInit) => Promise<Response>)(url, init);
    });
    render(<AutoTagBoard enabled />);
    await waitFor(() => expect(screen.getByText("Candidate queue")).toBeTruthy());
    await waitFor(() => expect(screen.getByText(/1 untagged of 2/)).toBeTruthy());
    await act(async () => {
      fireEvent.click(screen.getByText("Analyze untagged files with CLAP"));
    });
    await waitFor(() => expect(screen.getByText(/Semantic tagging…/)).toBeTruthy());
    expect(screen.getByText("Cancel")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("vjob_1")).toBeTruthy(), { timeout: 5000 });
  });

  it("explains a failed job in plain language", async () => {
    stubFetch([]);
    const baseFetch = globalThis.fetch;
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit): Promise<Response> => {
      if (url === "/api/extensions-v2/jobs" && init?.method === "POST") {
        return Response.json(
          { ok: true, outcome: { kind: "job", jobId: "vjob_9", state: "queued" } },
          { status: 202 },
        );
      }
      if (url === "/api/extensions-v2/jobs/vjob_9") {
        return Response.json({
          ok: true,
          job: {
            jobId: "vjob_9",
            state: "failed",
            progress: { completed: 3, total: 10 },
            error: { code: "handler-failed", message: "CLAP inference crashed on hum.wav" },
            partial: { succeeded: 0, failed: [] },
          },
        });
      }
      if (url === "/api/extensions-v2/execute") {
        const body = init?.body ? (JSON.parse(init.body as string) as { commandId?: string }) : {};
        if (body.commandId === "auto-tag-v2.clap-status") {
          return Response.json({
            ok: true,
            outcome: {
              kind: "immediate",
              value: {
                modelId: "m",
                state: "ready",
                downloadedBytes: 400,
                totalBytes: 400,
                backendAvailable: true,
              },
            },
          });
        }
        if (body.commandId === "auto-tag-v2.list-origins") {
          return Response.json({
            ok: true,
            outcome: {
              kind: "immediate",
              value: {
                summary: JSON.stringify({ total: 1, matching: 1, origins: { manual: 0, deterministic: 0, semantic_ai: 0 } }),
                entries: [JSON.stringify({ id: "u1", filename: "hum.wav", tags: [], firedRules: [] })],
                nextCursor: "",
              },
            },
          });
        }
      }
      return (baseFetch as (url: string, init?: RequestInit) => Promise<Response>)(url, init);
    });
    render(<AutoTagBoard enabled />);
    await waitFor(() => expect(screen.getByText("Candidate queue")).toBeTruthy());
    await act(async () => {
      fireEvent.click(screen.getByText("Analyze untagged files with CLAP"));
    });
    await waitFor(
      () =>
        expect(
          screen.getByText("Semantic tagging failed: CLAP inference crashed on hum.wav"),
        ).toBeTruthy(),
      { timeout: 5000 },
    );
  });

  it("tags untagged files with filename rules in bulk", async () => {    stubFetch([]);
    const baseFetch = globalThis.fetch;
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit): Promise<Response> => {
      if (url === "/api/extensions-v2/execute") {
        const body = init?.body ? (JSON.parse(init.body as string) as { commandId?: string; input?: unknown }) : {};
        if (body.commandId === "auto-tag-v2.list-origins") {
          return Response.json({
            ok: true,
            outcome: {
              kind: "immediate",
              value: {
                summary: JSON.stringify({ total: 2, matching: 2, origins: { manual: 0, deterministic: 0, semantic_ai: 0 } }),
                entries: [
                  JSON.stringify({ id: "u1", filename: "thunder.wav", tags: [], firedRules: [] }),
                  JSON.stringify({ id: "u2", filename: "rain.wav", tags: [], firedRules: [] }),
                ],
                nextCursor: "",
              },
            },
          });
        }
        if (body.commandId === "auto-tag-v2.tag-files") {
          const input = body.input as { fileIds?: unknown };
          expect(input.fileIds).toEqual(["u1", "u2"]);
          return Response.json({
            ok: true,
            outcome: {
              kind: "immediate",
              value: { tagged: 2, attached: 3, skipped: [], missing: [], failedFiles: [], failedReasons: [] },
            },
          });
        }
      }
      return (baseFetch as (url: string, init?: RequestInit) => Promise<Response>)(url, init);
    });
    render(<AutoTagBoard enabled />);
    await waitFor(() => expect(screen.getByText("Candidate queue")).toBeTruthy());
    await act(async () => {
      fireEvent.click(screen.getByText("Tag untagged files with filename rules"));
    });
    await waitFor(() => expect(screen.getByText("Tagged 2 files with 3 tags.")).toBeTruthy());
  });

  it("keeps rule words that are not tags out of the rail", async () => {
    stubFetch([]);
    const baseFetch = globalThis.fetch;
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit): Promise<Response> => {
      if (url === "/api/extensions-v2/execute") {
        const body = init?.body ? (JSON.parse(init.body as string) as { commandId?: string }) : {};
        if (body.commandId === "auto-tag-v2.coverage-summary") {
          return Response.json({
            ok: true,
            outcome: {
              kind: "immediate",
              value: {
                summary: JSON.stringify({
                  total: 2,
                  tagged: 1,
                  tags: { thunder: 1 },
                  allTags: ["thunder"],
                  configuredRules: [{ tok: "rain", tags: ["rain"] }],
                  members: [],
                }),
              },
            },
          });
        }
      }
      return (baseFetch as (url: string, init?: RequestInit) => Promise<Response>)(url, init);
    });
    render(<AutoTagBoard enabled />);
    await waitFor(() => expect(screen.getByText("Tags · 0/1 at goal")).toBeTruthy());
    expect(screen.queryByText("#rain")).toBeNull();
    expect(screen.queryByText(/Suggested/)).toBeNull();
    expect(screen.getAllByText("#thunder").length).toBeGreaterThan(0);
  });

  it("pages the file list under a tag", async () => {
    const seen: Array<Record<string, unknown>> = [];
    stubFetch([]);
    const baseFetch = globalThis.fetch;
    const page = (start: number, stop: number) =>
      Array.from({ length: stop - start }, (_, index) => {
        const at = start + index;
        return JSON.stringify({ id: `m${at}`, filename: `file-${at}.wav`, tags: [] });
      });
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit): Promise<Response> => {
      if (url === "/api/extensions-v2/execute") {
        const body = init?.body
          ? (JSON.parse(init.body as string) as { commandId?: string; input?: Record<string, unknown> })
          : {};
        if (body.commandId === "auto-tag-v2.coverage-summary" && typeof body.input === "object") {
          const input = (body.input ?? {}) as { tag?: unknown; cursor?: unknown };
          if (typeof input.tag === "string") {
            seen.push(input);
            const start = typeof input.cursor === "string" ? Number.parseInt(input.cursor, 10) || 0 : 0;
            return Response.json({
              ok: true,
              outcome: {
                kind: "immediate",
                value: {
                  summary: JSON.stringify({
                    total: 200,
                    tagged: 120,
                    tags: { thunder: 120 },
                    allTags: ["thunder"],
                    configuredRules: [],
                    members: page(start, Math.min(start + 50, 120)),
                    nextCursor: start + 50 < 120 ? String(start + 50) : "",
                  }),
                },
              },
            });
          }
          return Response.json({
            ok: true,
            outcome: {
              kind: "immediate",
              value: {
                summary: JSON.stringify({
                  total: 200,
                  tagged: 120,
                  tags: { thunder: 120 },
                  allTags: ["thunder"],
                  configuredRules: [],
                  members: [],
                }),
              },
            },
          });
        }
      }
      return (baseFetch as (url: string, init?: RequestInit) => Promise<Response>)(url, init);
    });
    render(<AutoTagBoard enabled />);
    await waitFor(() => expect(screen.getByText(/1–50 of 120/)).toBeTruthy());
    expect(screen.getByText("file-0.wav")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByText("Next"));
    });
    await waitFor(() => expect(screen.getByText(/51–100 of 120/)).toBeTruthy());
    expect(seen.some((input) => input.cursor === "50")).toBe(true);
    expect(screen.queryByText("file-0.wav")).toBeNull();
    expect(screen.getByText("file-50.wav")).toBeTruthy();
  });

  it("pages the candidate queue", async () => {
    stubFetch([]);
    const baseFetch = globalThis.fetch;
    const words = Array.from({ length: 25 }, (_, index) => `word${index}`);
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit): Promise<Response> => {
      if (url === "/api/extensions-v2/execute") {
        const body = init?.body ? (JSON.parse(init.body as string) as { commandId?: string }) : {};
        if (body.commandId === "auto-tag-v2.list-candidates") {
          return Response.json({
            ok: true,
            outcome: {
              kind: "immediate",
              value: {
                words,
                lines: words.map((word) => `${word} — 1 file`),
              },
            },
          });
        }
      }
      return (baseFetch as (url: string, init?: RequestInit) => Promise<Response>)(url, init);
    });
    render(<AutoTagBoard enabled />);
    await waitFor(() => expect(screen.getByText(/1–20 of 25/)).toBeTruthy());
    expect(screen.queryByText(/word20 — 1 file/)).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByText("Next"));
    });
    await waitFor(() => expect(screen.getByText(/21–25 of 25/)).toBeTruthy());
    expect(screen.getByText(/word20 — 1 file/)).toBeTruthy();
  });
});
