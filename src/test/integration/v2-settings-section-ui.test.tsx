// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { V3ExtensionsSection } from "@/app/(variant-i)/components/extensions/settings-section";
import { invalidateV2ClientCaches } from "@/lib/extensions-v2/contributions";
import { invalidateV2EntriesCache } from "@/components/extensions-v2/use-v2-extension-entries";

// Area: v2 UI wiring on the promoted surface (#205/#207). Replaces the
// deleted extensions-v2-ui integration suite, which exercised the old
// adapters. This one drives the live settings section against mocked
// routes: entries load, declared-but-denied permissions surface the
// approve affordance, and approve/reset/toggle each reach their route.
const calls: Array<{ url: string; method: string; body: unknown }> = [];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  calls.length = 0;
  invalidateV2ClientCaches();
  invalidateV2EntriesCache();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = (init?.method ?? "GET").toUpperCase();
      let body: unknown = null;
      if (typeof init?.body === "string") {
        try {
          body = JSON.parse(init.body);
        } catch {
          body = init.body;
        }
      }
      calls.push({ url, method, body });

      if (url === "/api/extensions-v2/extensions") {
        return jsonResponse({
          ok: true,
          extensions: [
            {
              id: "make-pack-v2",
              name: "Make Pack v2",
              version: "1.0.0",
              description: "Export packs.",
              enabled: true,
            },
          ],
        });
      }
      if (url === "/api/extensions-v2/settings/make-pack-v2") {
        return jsonResponse({
          ok: true,
          declaredPermissions: ["files:write"],
          effectivePermissions: [],
          settings: [],
        });
      }
      if (url.startsWith("/api/extensions-v2/extensions/make-pack-v2")) {
        return jsonResponse({ ok: true });
      }
      if (url.startsWith("/api/extensions-v2/settings/make-pack-v2")) {
        return jsonResponse({ ok: true });
      }
      return jsonResponse(
        { ok: false, error: { message: `unexpected ${method} ${url}` } },
        404,
      );
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("v2 settings section UI", () => {
  it("renders live entries and routes approve, reset and toggle writes", async () => {
    render(<V3ExtensionsSection />);

    await waitFor(() => expect(screen.getByText("Make Pack v2")).toBeTruthy());
    expect(screen.getByText("files:write")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Approve all" }));
    await waitFor(() =>
      expect(
        calls.some(
          (call) =>
            call.url === "/api/extensions-v2/extensions/make-pack-v2/approvals" &&
            call.method === "POST",
        ),
      ).toBe(true),
    );

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    await waitFor(() =>
      expect(
        calls.some(
          (call) =>
            call.url === "/api/extensions-v2/settings/make-pack-v2/reset" &&
            call.method === "POST",
        ),
      ).toBe(true),
    );

    const toggle =
      screen.queryByRole("switch", { name: /Make Pack v2/ }) ??
      screen.getByLabelText(/Toggle Make Pack v2/);
    fireEvent.click(toggle);
    await waitFor(() =>
      expect(
        calls.some(
          (call) =>
            call.url === "/api/extensions-v2/extensions/make-pack-v2" &&
            call.method === "PATCH",
        ),
      ).toBe(true),
    );
  });
});
