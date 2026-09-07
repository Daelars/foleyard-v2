import { NextResponse } from "next/server";

import {
  buildAppV2Catalog,
  isV2ExtensionEnabled,
} from "@/lib/extensions-v2/host";
import { getV2GrantedPermissions } from "@/lib/extensions-v2/policy";

export const dynamic = "force-dynamic";

/**
 * GET /api/extensions-v2/extensions — enablement plus effective
 * permissions for the v2 settings adapter. Data only; never executes.
 */
export async function GET() {
  const catalog = buildAppV2Catalog();
  return NextResponse.json({
    ok: true,
    extensions: catalog.entries.map((entry) => ({
      id: entry.id,
      name: entry.name,
      version: entry.version,
      description: entry.description,
      enabled: isV2ExtensionEnabled(entry.id),
      effectivePermissions: getV2GrantedPermissions(entry.id).filter((permission) =>
        entry.permissions.includes(permission),
      ),
      declaredPermissions: entry.permissions,
    })),
  });
}
