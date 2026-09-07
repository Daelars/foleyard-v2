import { NextResponse } from "next/server";

import { handleV2HttpJobGet } from "@yard-core";
import { ensureV2JobsRestored, getV2JobManager } from "@/lib/extensions-v2/jobs";

export const dynamic = "force-dynamic";

/** GET /api/extensions-v2/jobs/{jobId} — poll one job's status. */
export function GET(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  ensureV2JobsRestored();
  return context.params.then(({ jobId }) => {
    const response = handleV2HttpJobGet(getV2JobManager(), jobId ?? "");
    return NextResponse.json(response.body, { status: response.status });
  });
}
