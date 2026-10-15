"use client";

import { useCallback, useEffect, useState } from "react";

import { v2PlanApplyRoute, v2PlanRoute, type V2PlanReview } from "@yard-core";

/**
 * Review and apply flow for a host-prepared plan (#294).
 *
 * Review-producing commands return a `review-required` outcome carrying a
 * plan ID. This hook fetches the host-stamped review and echoes its
 * targets and options back on apply, so the plan is never stranded and
 * the applied result matches what the user reviewed. The hook is
 * surface-agnostic: the palette, a context menu, or a dedicated dialog
 * can all drive it.
 */

type ApplyBody = {
  ok?: boolean;
  outcome?: { kind?: string; value?: unknown };
  error?: { message?: string };
};

async function readJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

export type V2PlanReviewState = {
  review: V2PlanReview | null;
  loading: boolean;
  applying: boolean;
  error: string | null;
  /** Echo the reviewed plan back to the host; resolves true when applied. */
  apply: () => Promise<boolean>;
};

export function useV2PlanReview({
  planId,
  onApplied,
}: {
  planId: string | null;
  onApplied?: (value: unknown) => void;
}): V2PlanReviewState {
  const [review, setReview] = useState<V2PlanReview | null>(null);
  const [loading, setLoading] = useState(planId !== null);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- the review surface
       resets its own local state when the dialog opens or closes */
    if (!planId) {
      setReview(null);
      setLoading(false);
      setError(null);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    setReview(null);
    void (async () => {
      let response: Response;
      try {
        response = await fetch(v2PlanRoute(planId));
      } catch (caught) {
        if (active) {
          setError(
            `Could not load the review: ${caught instanceof Error ? caught.message : String(caught)}`,
          );
          setLoading(false);
        }
        return;
      }
      const body = (await readJson(response)) as {
        ok?: boolean;
        review?: V2PlanReview;
        error?: { message?: string };
      } | null;
      if (!active) return;
      if (!response.ok || !body?.ok || !body.review) {
        setError(body?.error?.message ?? "Could not load the review.");
        setLoading(false);
        return;
      }
      setReview(body.review);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [planId]);

  const apply = useCallback(async (): Promise<boolean> => {
    if (!review) return false;
    setApplying(true);
    setError(null);
    try {
      const response = await fetch(v2PlanApplyRoute(review.planId), {
        method: "POST",
        headers: { "content-type": "application/json" },
        // Echo the reviewed targets/options verbatim: any difference
        // rejects with `plan-altered`.
        body: JSON.stringify({ targets: review.targets, options: review.options }),
      });
      const body = (await readJson(response)) as ApplyBody | null;
      if (!response.ok || !body?.ok) {
        setError(body?.error?.message ?? "The change could not be applied.");
        return false;
      }
      onApplied?.(body.outcome?.value);
      return true;
    } catch (caught) {
      setError(
        `The change could not be applied: ${caught instanceof Error ? caught.message : String(caught)}`,
      );
      return false;
    } finally {
      setApplying(false);
    }
  }, [review, onApplied]);

  return { review, loading, applying, error, apply };
}
