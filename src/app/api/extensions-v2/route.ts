import { NextResponse } from "next/server";

import { buildAppV2Catalog } from "@/lib/extensions-v2/host";

export const dynamic = "force-dynamic";

/**
 * GET /api/extensions-v2 — serializable v2 catalog with effective
 * (declared ∩ approved) permissions. v1 endpoints are untouched.
 */
export async function GET() {
  return NextResponse.json({ ok: true, catalog: buildAppV2Catalog() });
}
