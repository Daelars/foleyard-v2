import { NextResponse } from "next/server";

import { isExtensionEnabled } from "@/lib/extensions/registry";
import { clearSoundShelf } from "@/lib/extensions/sound-shelf-store";

export const dynamic = "force-dynamic";

export async function POST() {
  if (!isExtensionEnabled("sound-shelf")) {
    return NextResponse.json(
      { error: "Extension is disabled" },
      { status: 403 },
    );
  }

  return NextResponse.json(clearSoundShelf());
}
