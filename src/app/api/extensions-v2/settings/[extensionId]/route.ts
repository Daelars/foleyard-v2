import { NextResponse } from "next/server";

import { getV2Registry } from "@/lib/extensions-v2/host";
import { getV2GrantedPermissions } from "@/lib/extensions-v2/policy";
import { createV2AuthoredSettings } from "@/lib/extensions-v2/settings-state";

export const dynamic = "force-dynamic";

/**
 * GET /api/extensions-v2/settings/:extensionId — declared settings
 * with current values, defaults, and the effective permissions the
 * settings adapter explains. Data only; never executes.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ extensionId: string }> },
) {
  const { extensionId } = await context.params;
  const definition = getV2Registry().get(extensionId);
  if (!definition) {
    return NextResponse.json(
      { ok: false, error: { code: "extension-unknown", message: `Unknown v2 extension "${extensionId}".` } },
      { status: 404 },
    );
  }
  const store = createV2AuthoredSettings(extensionId, definition.settings ?? []);
  return NextResponse.json({
    ok: true,
    extensionId,
    effectivePermissions: getV2GrantedPermissions(extensionId),
    declaredPermissions: definition.permissions,
    settings: (definition.settings ?? []).map((setting) => ({
      declaration: setting,
      value: store.get(setting.id),
    })),
    diagnosis: store.diagnose(),
  });
}
