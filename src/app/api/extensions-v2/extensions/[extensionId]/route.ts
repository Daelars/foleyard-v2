import { NextRequest, NextResponse } from "next/server";

import {
  getV2Registry,
  isV2ExtensionEnabled,
  setV2ExtensionEnabled,
} from "@/lib/extensions-v2/host";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/extensions-v2/extensions/:id — enable or disable a v2
 * extension. Disabling rejects new work and requests cancellation of
 * the extension's live jobs; the host emits `contributions-changed`
 * so adapters remove its UI. Body: `{ "enabled": boolean }`.
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ extensionId: string }> },
) {
  const { extensionId } = await context.params;
  if (!getV2Registry().get(extensionId)) {
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
  const enabled = (body as { enabled?: unknown })?.enabled;
  if (typeof enabled !== "boolean") {
    return NextResponse.json(
      { ok: false, error: { code: "input-invalid", message: "Body needs { enabled: boolean }." } },
      { status: 400 },
    );
  }
  setV2ExtensionEnabled(extensionId, enabled);
  return NextResponse.json({
    ok: true,
    extensionId,
    enabled: isV2ExtensionEnabled(extensionId),
  });
}
