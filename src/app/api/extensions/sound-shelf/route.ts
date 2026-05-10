import { NextResponse } from "next/server";

import { createAppExtensionContext } from "@/lib/composition-root";
import { createServiceWithStore, manifest } from "@foleyard/sound-shelf";

import { getFileById } from "@/lib/db";
import { isExtensionEnabled } from "@/lib/extensions/registry";
import { DbSoundShelfStore } from "@/lib/extensions/sound-shelf-store";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isExtensionEnabled("sound-shelf")) {
    return NextResponse.json({ items: [] });
  }

  const context = createAppExtensionContext({
    permissions: manifest.permissions,
  });

  const service = createServiceWithStore(context, new DbSoundShelfStore());

  const items = service
    .getItems()
    .map((fileId) => {
      const file = getFileById(fileId);
      if (!file) {
        return null;
      }

      return {
        fileId,
        filename: file.filename,
        duration: file.duration,
        format: file.format,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return NextResponse.json({ items });
}
