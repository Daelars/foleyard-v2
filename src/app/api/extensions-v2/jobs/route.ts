import { NextRequest, NextResponse } from "next/server";

import { handleV2HttpJobList, handleV2HttpJobSubmit } from "@yard-core";
import { getAppV2Host } from "@/lib/extensions-v2/host";
import { ensureV2JobsRestored, getV2JobManager } from "@/lib/extensions-v2/jobs";

export const dynamic = "force-dynamic";

/**
 * POST /api/extensions-v2/jobs — start host-owned job work, 202 with
 * the job outcome. Duplicate idempotency keys return the existing job.
 *
 * GET /api/extensions-v2/jobs — poll bounded job history (newest
 * first). Stateless polling: reconnect or reload and pass the same job
 * ID again. v1 routes are untouched.
 */
export async function POST(request: NextRequest) {
  ensureV2JobsRestored();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "input-invalid", message: "Request body must be valid JSON." } },
      { status: 400 },
    );
  }
  const response = await handleV2HttpJobSubmit(getAppV2Host(), body);
  return NextResponse.json(response.body, { status: response.status });
}

export function GET(request: NextRequest) {
  ensureV2JobsRestored();
  const params = request.nextUrl.searchParams;
  const cursor = params.get("cursor");
  const limitRaw = params.get("limit");
  const response = handleV2HttpJobList(getV2JobManager(), {
    ...(cursor !== null ? { cursor } : {}),
    ...(limitRaw !== null ? { limit: Number(limitRaw) } : {}),
  });
  return NextResponse.json(response.body, { status: response.status });
}
