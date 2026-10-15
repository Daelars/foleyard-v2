// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { V2PlanReview } from "@yard-core";

import { useV2PlanReview } from "./use-v2-plan-review";

// Area: #294. Review-producing commands must render an applicable review
// and apply flow: fetch the host-stamped review and echo its targets and
// options back on apply. A prepared plan is never left stranded.

function review(over: Partial<V2PlanReview> = {}): V2PlanReview {
  return {
    planId: "vplan_1",
    extensionId: "folder-janitor-v2",
    commandId: "folder-janitor-v2.delete-folders",
    summary: "Delete 2 empty folders",
    tables: [
      {
        id: "folders",
        title: "Folders",
        columns: ["Folder"],
        rows: [["/music/empty-a"], ["/music/empty-b"]],
      },
    ],
    notices: [{ tone: "warning", message: "Only empty folders are deleted." }],
    targets: { fileIds: [] },
    options: { folders: ["/music/empty-a", "/music/empty-b"] },
    destructive: true,
    reversibility: "irreversible-files",
    reversibilityNote: "Deleted folders cannot be restored.",
    createdAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2026-01-01T00:15:00.000Z",
    reviewedAt: "2026-01-01T00:01:00.000Z",
    ...over,
  };
}

describe("useV2PlanReview", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads the host review and applies the exact echoed plan", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.includes("/apply")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            outcome: { kind: "immediate", value: { deleted: 2 } },
          }),
        };
      }
      return { ok: true, status: 200, json: async () => ({ ok: true, review: review() }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    const onApplied = vi.fn();
    const { result } = renderHook(() =>
      useV2PlanReview({ planId: "vplan_1", onApplied }),
    );

    await waitFor(() => expect(result.current.review).not.toBeNull());
    expect(calls[0]!.url).toBe("/api/extensions-v2/plans/vplan_1");
    expect(result.current.review?.summary).toBe("Delete 2 empty folders");

    await act(async () => {
      await result.current.apply();
    });

    const applyCall = calls.find((call) => call.url.includes("/apply"))!;
    expect(applyCall.url).toBe("/api/extensions-v2/plans/vplan_1/apply");
    expect(applyCall.init?.method).toBe("POST");
    expect(JSON.parse(applyCall.init!.body as string)).toEqual({
      targets: { fileIds: [] },
      options: { folders: ["/music/empty-a", "/music/empty-b"] },
    });
    expect(onApplied).toHaveBeenCalledWith({ deleted: 2 });
  });

  it("surfaces load and apply failures instead of pretending success", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.includes("/apply")
        ? {
            ok: false,
            status: 400,
            json: async () => ({
              ok: false,
              error: { message: "Plan expired." },
            }),
          }
        : {
            ok: false,
            status: 404,
            json: async () => ({ ok: false, error: { message: "Plan unknown." } }),
          },
    );
    vi.stubGlobal("fetch", fetchMock);

    const onApplied = vi.fn();
    const { result } = renderHook(() =>
      useV2PlanReview({ planId: "vplan_missing", onApplied }),
    );

    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.error).toMatch(/unknown/i);
    expect(onApplied).not.toHaveBeenCalled();
  });
});
