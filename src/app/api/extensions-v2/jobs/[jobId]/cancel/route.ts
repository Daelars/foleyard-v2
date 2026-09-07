import { NextResponse } from "next/server";

import { handleV2HttpJobCancel } from "@yard-core";
import { ensureV2JobsRestored, getV2JobManager } from "@/lib/extensions-v2/jobs";

export const dynamic = "force-dynamic";

/**
 * POST /api/extensions-v2/jobs/{jobId}/cancel — request cancellation.
 * Idempotent: terminal jobs return their current record.
 */
export function POST(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  ensureV2JobsRestored();
  return context.params.then(({ jobId }) => {
    const response = handleV2HttpJobCancel(getV2JobManager(), jobId ?? "");
    return NextResponse.json(response.body, { status: response.status });
  });
}
