import { NextRequest, NextResponse } from "next/server";

import { isKnownV2Permission } from "@yard-core";
import { getV2Registry } from "@/lib/extensions-v2/host";
import { revokeV2Approval, setV2Approval } from "@/lib/extensions-v2/policy";

export const dynamic = "force-dynamic";

/**
 * POST /api/extensions-v2/extensions/:id/approvals — record an
 * explicit permission approval for a v2 extension.
 * Body: `{ "permissions": string[] }`. Every name must be known and
 * declared by the extension; nothing is inferred or auto-granted.
 * Persists before notifying, like every other v2 settings write.
 *
 * DELETE — revoke the extension's approval (deny by default again).
 */
export async function POST(
  request: NextRequest,
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
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "input-invalid", message: "Request body must be valid JSON." } },
      { status: 400 },
    );
  }
  const permissions = (body as { permissions?: unknown })?.permissions;
  if (!Array.isArray(permissions) || permissions.length === 0) {
    return NextResponse.json(
      { ok: false, error: { code: "input-invalid", message: "Body needs { permissions: string[] } with at least one permission." } },
      { status: 400 },
    );
  }
  const declared = new Set(definition.permissions);
  for (const permission of permissions) {
    if (!isKnownV2Permission(permission) || !declared.has(permission)) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "input-invalid",
            message: `Permission ${JSON.stringify(permission)} is not declared by extension "${extensionId}"; declared: ${definition.permissions.join(", ") || "none"}.`,
          },
        },
        { status: 400 },
      );
    }
  }
  setV2Approval(extensionId, permissions);
  return NextResponse.json({ ok: true, extensionId, permissions });
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ extensionId: string }> },
) {
  const { extensionId } = await context.params;
  if (!getV2Registry().get(extensionId)) {
    return NextResponse.json(
      { ok: false, error: { code: "extension-unknown", message: `Unknown v2 extension "${extensionId}".` } },
      { status: 404 },
    );
  }
  revokeV2Approval(extensionId);
  return NextResponse.json({ ok: true, extensionId });
}
