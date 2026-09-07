import { NextResponse } from "next/server";

import { handleV2HttpPlanGet } from "@yard-core";
import { getAppV2Host } from "@/lib/extensions-v2/host";

export const dynamic = "force-dynamic";

/**
 * GET /api/extensions-v2/plans/{planId} — review a prepared plan.
 * Host-recorded read: stamps the review that unlocks destructive
 * applies. Unknown IDs report `plan-unknown`; v1 routes are untouched.
 */
export function GET(_request: Request, context: { params: Promise<{ planId: string }> }) {
  return context.params.then(({ planId }) => {
    const response = handleV2HttpPlanGet(getAppV2Host(), planId ?? "");
    return NextResponse.json(response.body, { status: response.status });
  });
}
