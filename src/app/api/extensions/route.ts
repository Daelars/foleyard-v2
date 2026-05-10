import { NextRequest, NextResponse } from "next/server";

import {
  getRegisteredExtensionGridItem,
  listRegisteredExtensionGridItems,
  updateExtensionEnabled,
} from "@/lib/extensions/registry";
import { setExtensionSettingValue } from "@/lib/extensions/settings-store";

export const dynamic = "force-dynamic";

export async function GET() {
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
    return NextResponse.json(
      { error: "extensionId is required" },
      { status: 400 },
    );
  }

  if (typeof body.enabled === "boolean") {
    const extension = updateExtensionEnabled(body.extensionId, body.enabled);
    if (!extension) {
      return NextResponse.json({ error: "Extension not found" }, { status: 404 });
    }

    return NextResponse.json({ extension });
  }

  if (body.settingId) {
    const extension = getRegisteredExtensionGridItem(body.extensionId);
    const setting = extension?.settings?.find(
      (candidate) => candidate.id === body.settingId,
    );

    if (!extension || !setting) {
      return NextResponse.json(
        { error: "Extension setting not found" },
        { status: 404 },
      );
    }

    setExtensionSettingValue(
      body.extensionId,
      body.settingId,
      coerceSettingValue(setting.type, body.value, setting.defaultValue),
    );

    return NextResponse.json({
      extension: getRegisteredExtensionGridItem(body.extensionId),
    });
  }

  return NextResponse.json(
    { error: "enabled or settingId is required" },
    { status: 400 },
  );
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
