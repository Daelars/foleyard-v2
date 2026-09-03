import { NextResponse } from "next/server";

import { getFileById } from "@/lib/db";
import { createAppExtensionHost } from "@/lib/extensions/host";

import { toHostFailureResponse } from "../host-outcome";

export const dynamic = "force-dynamic";

export async function GET() {
  const outcome = await createAppExtensionHost().execute<string[]>({
    extensionId: "sound-shelf",
    commandId: "sound-shelf.list",
  });

  if (!outcome.ok && outcome.reason === "extension-disabled") {
    return NextResponse.json({ items: [] });
  }

  if (!outcome.ok) {
    return toHostFailureResponse(outcome);
  }

  if (outcome.type === "ui-intent") {
    return NextResponse.json({ error: "Unexpected UI intent" }, { status: 500 });
  }

  const items = outcome.value
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
