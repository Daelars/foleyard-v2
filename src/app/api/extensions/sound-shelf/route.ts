import { NextResponse } from "next/server";

import { getFileById } from "@/lib/db";
import { isExtensionEnabled } from "@/lib/extensions/registry";
import { getSoundShelfFileIds } from "@/lib/extensions/sound-shelf-store";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isExtensionEnabled("sound-shelf")) {
    return NextResponse.json({ items: [] });
  }

  const items = getSoundShelfFileIds()
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
