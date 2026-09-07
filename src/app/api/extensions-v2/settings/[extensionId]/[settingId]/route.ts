import { NextRequest, NextResponse } from "next/server";

import { getV2Registry } from "@/lib/extensions-v2/host";
import { createV2AuthoredSettings } from "@/lib/extensions-v2/settings-state";

export const dynamic = "force-dynamic";

/**
 * PUT /api/extensions-v2/settings/:extensionId/:settingId — validated
 * single-setting write. Declaration validation rejects bad values
 * with 400 and a human-readable reason; persistence precedes the
 * `settings-changed` notification.
 */
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ extensionId: string; settingId: string }> },
) {
  const { extensionId, settingId } = await context.params;
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
  const store = createV2AuthoredSettings(extensionId, definition.settings ?? []);
  try {
    store.set(settingId, (body as { value?: unknown })?.value);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "setting-invalid",
          message: error instanceof Error ? error.message : String(error),
        },
      },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true, extensionId, settingId, value: store.get(settingId) });
}

/**
 * POST /api/extensions-v2/settings/:extensionId/reset — reset one
 * setting (`{ settingId }`) or all (`{}`) to declared defaults.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ extensionId: string; settingId: string }> },
) {
  const { extensionId } = await context.params;
  const definition = getV2Registry().get(extensionId);
  if (!definition) {
    return NextResponse.json(
      { ok: false, error: { code: "extension-unknown", message: `Unknown v2 extension "${extensionId}".` } },
      { status: 404 },
    );
  }
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const settingId = (body as { settingId?: unknown })?.settingId;
  const store = createV2AuthoredSettings(extensionId, definition.settings ?? []);
  try {
    if (settingId === undefined) {
      store.reset();
    } else if (typeof settingId === "string") {
      store.reset(settingId);
    } else {
      return NextResponse.json(
        { ok: false, error: { code: "input-invalid", message: "settingId must be a string." } },
        { status: 400 },
      );
    }
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "setting-invalid",
          message: error instanceof Error ? error.message : String(error),
        },
      },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true, extensionId });
}
