import { NextResponse } from "next/server";

import { getFileById, getTagsForFiles } from "@/lib/db";
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

  const ids = outcome.value.filter((fileId) => getFileById(fileId) !== null);
  const tagsByFile = getTagsForFiles(ids);

  const items = ids.map((fileId) => {
    const file = getFileById(fileId)!;

    return {
      id: file.id,
      filename: file.filename,
      path: file.path,
      directory: file.directory,
      format: file.format,
      duration: file.duration,
      fileSize: file.fileSize,
      isFavorite: file.isFavorite,
      tags: tagsByFile.get(file.id) ?? [],
    };
  });

  return NextResponse.json({ items });
}
