import { NextRequest, NextResponse } from "next/server";

import { isExtensionEnabled } from "@/lib/extensions/registry";
import { addToSoundShelf } from "@/lib/extensions/sound-shelf-store";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isExtensionEnabled("sound-shelf")) {
    return NextResponse.json(
      { error: "Extension is disabled" },
      { status: 403 },
    );
  }

  const body = (await request.json()) as { fileIds?: string[] };
  const fileIds = body.fileIds;

  if (!fileIds || !Array.isArray(fileIds)) {
    return NextResponse.json(
      { error: "fileIds array required" },
      { status: 400 },
    );
  }

  return NextResponse.json(addToSoundShelf(fileIds));
}
