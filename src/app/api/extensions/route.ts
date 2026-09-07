import { errorResponse } from "@/lib/api/errors";
import { NextRequest, NextResponse } from "next/server";

import {
  getRegisteredExtensionGridItem,
  listRegisteredExtensionGridItems,
  updateExtensionEnabled,
} from "@/lib/extensions/registry";
import { setExtensionSettingValue } from "@/lib/extensions/settings-store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const view = request.nextUrl.searchParams.get("view");
  if (view === "catalog") {
    const { registerAllExtensions } = await import("@/lib/extensions/registry");
    const { extensionRegistry } = await import("@/lib/extensions/runtime");
    const { projectCatalogEntry } = await import("@/lib/extensions/catalog");
    const { isExtensionEnabled } = await import("@/lib/extensions/registry");
    registerAllExtensions();
    const entries = extensionRegistry
      .listManifests()
      .map((m) => projectCatalogEntry(m, { enabled: isExtensionEnabled(m.id), permissionModel: "host-enforced" }));
    return NextResponse.json({ extensions: entries });
  }
  return NextResponse.json({
    extensions: listRegisteredExtensionGridItems(),
  });
}

export async function PATCH(request: NextRequest) {
  const body = (await request.json()) as {
    extensionId?: string;
    enabled?: boolean;
    settingId?: string;
    value?: unknown;
  };

  if (!body.extensionId) {
    return errorResponse("extensionId is required", 400);
  }

  if (typeof body.enabled === "boolean") {
    const extension = updateExtensionEnabled(body.extensionId, body.enabled);
    if (!extension) {
      return errorResponse("Extension not found", 404);
    }

    return NextResponse.json({ extension });
  }

  if (body.settingId) {
    const extension = getRegisteredExtensionGridItem(body.extensionId);
    const setting = extension?.settings?.find(
      (candidate) => candidate.id === body.settingId,
    );

    if (!extension || !setting) {
      return errorResponse("Extension setting not found", 404);
    }

    const coerced = coerceSettingValue(setting.type, body.value, setting.defaultValue);
    const { validateSettingValue } = await import("@/lib/settings-schema");
    const invalid = validateSettingValue(
      { type: setting.type, options: setting.options },
      coerced,
    );
    if (invalid) {
      return errorResponse(invalid, 400);
    }

    setExtensionSettingValue(
      body.extensionId,
      body.settingId,
      coerced,
    );

    return NextResponse.json({
      extension: getRegisteredExtensionGridItem(body.extensionId),
    });
  }

  return errorResponse("enabled or settingId is required", 400);
}

function coerceSettingValue(
  type: NonNullable<
    NonNullable<ReturnType<typeof getRegisteredExtensionGridItem>>["settings"]
  >[number]["type"],
  value: unknown,
  defaultValue: unknown,
) {
  if (type === "boolean") {
    return typeof value === "boolean" ? value : Boolean(defaultValue);
  }

  if (type === "number") {
    const numberValue =
      typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
    return Number.isFinite(numberValue) ? numberValue : defaultValue;
  }

  return typeof value === "string" ? value : String(defaultValue ?? "");
}
