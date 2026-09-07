import { NextRequest, NextResponse } from "next/server";

import { handleV2HttpExecute } from "@yard-core";
import { createAppV2Host } from "@/lib/extensions-v2/host";

export const dynamic = "force-dynamic";

/**
 * POST /api/extensions-v2/execute — thin wrapper over the single v2
 * execution path. Payload limits, ownership, availability preflight,
 * and envelopes come from the transport codec; v1 routes are untouched.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "input-invalid", message: "Request body must be valid JSON." } },
      { status: 400 },
    );
  }
  const response = await handleV2HttpExecute(createAppV2Host(), body);
  return NextResponse.json(response.body, { status: response.status });
}
