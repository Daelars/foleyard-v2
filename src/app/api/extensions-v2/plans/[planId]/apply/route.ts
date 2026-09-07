import { NextRequest, NextResponse } from "next/server";

import { handleV2HttpPlanApply } from "@yard-core";
import { getAppV2Host } from "@/lib/extensions-v2/host";

export const dynamic = "force-dynamic";

/**
 * POST /api/extensions-v2/plans/{planId}/apply — apply a reviewed plan.
 * The body must echo the review's targets and options byte-identically;
 * altered/expired/consumed plans reject per the documented policy and a
 * client `confirmed` flag is never sufficient. v1 routes are untouched.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ planId: string }> }) {
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
  const response = await handleV2HttpPlanApply(getAppV2Host(), planId ?? "", body);
  return NextResponse.json(response.body, { status: response.status });
}
