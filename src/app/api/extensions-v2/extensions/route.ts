import { NextResponse } from "next/server";

import {
  buildAppV2Catalog,
  isV2ExtensionEnabled,
} from "@/lib/extensions-v2/host";
import { getV2GrantedPermissions } from "@/lib/extensions-v2/policy";
import { getV2PolicyHealth } from "@/lib/extensions-v2/runtime";

export const dynamic = "force-dynamic";

/**
 * GET /api/extensions-v2/extensions — enablement plus effective
 * permissions for the v2 settings adapter. Data only; never executes.
 * `policyHealth` surfaces the explicit degraded state when permission
 * or enablement policy could not be hydrated or persisted (#266).
 */
export async function GET() {
  const catalog = buildAppV2Catalog();
  const extensions = catalog.entries.map((entry) => ({
    id: entry.id,
    name: entry.name,
    version: entry.version,
    description: entry.description,
    enabled: isV2ExtensionEnabled(entry.id),
    effectivePermissions: getV2GrantedPermissions(entry.id).filter((permission) =>
      entry.permissions.includes(permission),
    ),
    declaredPermissions: entry.permissions,
  }));
  return NextResponse.json({
    ok: true,
    policyHealth: getV2PolicyHealth(),
    extensions,
  });
}
