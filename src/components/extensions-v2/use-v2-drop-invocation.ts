"use client";

import { useCallback, useState } from "react";

import {
  v2PlanApplyRoute,
  v2PlanRoute,
  type ExtensionV2Catalog,
  type V2PlanReview,
} from "@yard-core";
import { getDesktopBridge } from "@/lib/desktop";
import { invokeV2Command } from "@/lib/extensions-v2/contributions";
import {
  buildDropCommandInput,
  dropGrantSlot,
  findCatalogCommand,
} from "@/lib/extensions-v2/drop-context";
import { pickV2Grant } from "@/lib/extensions-v2/picker-grant-client";

/**
 * Drop menu → real execution (Application context, #283).
 *
 * One invocation path for the Library drop zone: resolve the dropped OS
 * files to Library IDs, obtain the destination/staging grant the command
 * declares through the shared picker-to-grant flow (#263), pass the exact
 * command input, then — when `apply` returns a review plan — review it and
 * apply it with its original drop context preserved. The renderer never
 * builds a half-command and never invents a directory path.
 */

export type ResolveDropFiles = (
  names: readonly string[],
) => Promise<{ fileIds: string[]; missing: string[] }>;

export type DropInvokeResult =
  | { ok: true; kind: "immediate"; value: unknown }
  | { ok: true; kind: "applied"; review: V2PlanReview; value: unknown }
  | { ok: false; error: string };

export type DropInvokeRequest = {
  extensionId: string;
  commandId: string;
  names: readonly string[];
};

type OutcomeBody = {
  ok?: boolean;
  error?: { message?: string };
  outcome?: { kind?: string; planId?: string; value?: unknown };
};

async function fetchReview(
  planId: string,
): Promise<{ ok: true; review: V2PlanReview } | { ok: false; error: string }> {
  let response: Response;
  try {
    response = await fetch(v2PlanRoute(planId));
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  const body = (await response.json().catch(() => null)) as {
    ok?: boolean;
    review?: V2PlanReview;
    error?: { message?: string };
  } | null;
  if (!response.ok || !body?.ok || !body.review) {
    return { ok: false, error: body?.error?.message ?? "Could not load the drop review." };
  }
  return { ok: true, review: body.review };
}

async function applyPlan(
  planId: string,
  review: V2PlanReview,
): Promise<{ ok: true; value: unknown } | { ok: false; error: string }> {
  let response: Response;
  try {
    response = await fetch(v2PlanApplyRoute(planId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ targets: review.targets, options: review.options }),
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  const body = (await response.json().catch(() => null)) as {
    ok?: boolean;
    error?: { message?: string };
    outcome?: { kind?: string; value?: unknown };
  } | null;
  if (!response.ok || !body?.ok) {
    return { ok: false, error: body?.error?.message ?? "Could not apply the drop plan." };
  }
  return { ok: true, value: body.outcome?.kind === "immediate" ? body.outcome.value : undefined };
}

export function useV2DropInvocation({
  catalog,
  resolveDropFiles,
}: {
  catalog: ExtensionV2Catalog | null;
  resolveDropFiles: ResolveDropFiles;
}) {
  const [busy, setBusy] = useState(false);

  const invoke = useCallback(
    async (request: DropInvokeRequest): Promise<DropInvokeResult> => {
      setBusy(true);
      try {
        const command = findCatalogCommand(catalog, request.extensionId, request.commandId);
        const slot = dropGrantSlot(command);
        let grantId: string | null = null;
        if (slot) {
          // The picker mints a single-use proof; the grant route spends it.
          const picked = await pickV2Grant(
            getDesktopBridge(),
            request.extensionId,
            "destination",
          );
          if (!picked.ok) return { ok: false, error: picked.error };
          grantId = picked.grantId;
        }

        const resolved = await resolveDropFiles(request.names);
        if (resolved.fileIds.length === 0) {
          return {
            ok: false,
            error: "None of the dropped sounds are in the Library; add them to the Library first.",
          };
        }

        const invoked = await invokeV2Command({
          extensionId: request.extensionId,
          commandId: request.commandId,
          fileIds: resolved.fileIds,
          dropFileCount: request.names.length,
          commandInput: buildDropCommandInput(command, resolved.fileIds, grantId),
        });
        if (!invoked.ok) return { ok: false, error: invoked.message };
        const body = invoked.body as OutcomeBody;
        if (!body?.ok) {
          return { ok: false, error: body?.error?.message ?? "Drop command failed." };
        }

        const outcome = body.outcome;
        if (outcome?.kind === "review-required" && outcome.planId) {
          const reviewed = await fetchReview(outcome.planId);
          if (!reviewed.ok) return reviewed;
          const applied = await applyPlan(outcome.planId, reviewed.review);
          if (!applied.ok) return applied;
          return { ok: true, kind: "applied", review: reviewed.review, value: applied.value };
        }
        return { ok: true, kind: "immediate", value: outcome?.value };
      } finally {
        setBusy(false);
      }
    },
    [catalog, resolveDropFiles],
  );

  return { invoke, busy };
}
