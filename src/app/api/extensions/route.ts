import { NextRequest, NextResponse } from "next/server";

import {
  listRegisteredExtensionGridItems,
  updateExtensionEnabled,
} from "@/lib/extensions/registry";

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
  };

  if (!body.extensionId || typeof body.enabled !== "boolean") {
    return NextResponse.json(
      { error: "extensionId and enabled are required" },
      { status: 400 },
    );
  }

  const extension = updateExtensionEnabled(body.extensionId, body.enabled);
  if (!extension) {
    return NextResponse.json({ error: "Extension not found" }, { status: 404 });
  }

  return NextResponse.json({ extension });
}
