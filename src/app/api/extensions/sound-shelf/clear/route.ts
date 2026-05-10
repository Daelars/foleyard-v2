import { NextResponse } from "next/server";

import { createAppExtensionContext } from "@/lib/composition-root";
import { createServiceWithStore, manifest } from "@foleyard/sound-shelf";

import { isExtensionEnabled } from "@/lib/extensions/registry";
import { DbSoundShelfStore } from "@/lib/extensions/sound-shelf-store";

export const dynamic = "force-dynamic";

export async function POST() {
  if (!isExtensionEnabled("sound-shelf")) {
    return NextResponse.json(
      { error: "Extension is disabled" },
      { status: 403 },
    );
  }

  const context = createAppExtensionContext({
    permissions: manifest.permissions,
  });

  const service = createServiceWithStore(context, new DbSoundShelfStore());

  return NextResponse.json(service.clear());
}
