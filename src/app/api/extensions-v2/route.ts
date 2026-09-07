import { NextResponse } from "next/server";

import { buildAppV2Catalog } from "@/lib/extensions-v2/host";
import { devFixturesEnabled, registerV2DevFixtures } from "@/lib/extensions-v2/fixtures";

export const dynamic = "force-dynamic";

/**
 * GET /api/extensions-v2 — serializable v2 catalog with effective
 * (declared ∩ approved) permissions. v1 endpoints are untouched.
 *
 * Development fixtures register only when `FOLEYARD_V2_DEV_FIXTURES=1`
 * in a non-production runtime; production catalogs never include
 * them (`registerV2DevFixtures` throws there).
 */
export async function GET() {
  if (devFixturesEnabled()) {
    registerV2DevFixtures();
  }
  return NextResponse.json({ ok: true, catalog: buildAppV2Catalog() });
}
