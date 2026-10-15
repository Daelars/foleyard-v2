import { NextRequest, NextResponse } from "next/server";

import { handleV2HttpPlanJobSubmit } from "@yard-core";
import { getAppV2Host } from "@/lib/extensions-v2/host";
import { ensureV2JobsRestored } from "@/lib/extensions-v2/jobs";

export const dynamic = "force-dynamic";

/**
 * POST /api/extensions-v2/plans/{planId}/job — start the reviewed plan as
 * a host-owned background job (R5 + R4). The body echoes the review's
 * `targets` and `options` byte-identically; altered/expired/consumed
 * plans reject, so the job executes the exact reviewed plan instead of a
 * source re-resolved after review. v1 routes are untouched.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ planId: string }> }) {
  ensureV2JobsRestored();
  const { planId } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "input-invalid", message: "Request body must be valid JSON." } },
      { status: 400 },
    );
  }
  const response = await handleV2HttpPlanJobSubmit(getAppV2Host(), planId ?? "", body);
  return NextResponse.json(response.body, { status: response.status });
}
