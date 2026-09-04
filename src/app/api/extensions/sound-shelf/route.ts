import { NextResponse } from "next/server";

import type { IndexedAudioFile } from "@yard-core";

import { getFileById, getTagsForFiles } from "@/lib/db";
import { createAppExtensionHost } from "@/lib/extensions/host";
import { DbSoundShelfStore } from "@/lib/extensions/sound-shelf-store";

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

  const files = outcome.value
    .map((fileId) => getFileById(fileId))
    .filter((file): file is IndexedAudioFile => file !== null && file.removedAt === null);
  const ids = files.map((file) => file.id);
  if (ids.length !== outcome.value.length) {
    new DbSoundShelfStore().setFileIds(ids);
  }
  const tagsByFile = getTagsForFiles(ids);

  const items = files.map((file) => ({
      id: file.id,
      filename: file.filename,
      path: file.path,
      directory: file.directory,
      format: file.format,
      duration: file.duration,
      fileSize: file.fileSize,
      mtimeMs: file.mtimeMs,
      isFavorite: file.isFavorite,
      tags: tagsByFile.get(file.id) ?? [],
    }));

  return NextResponse.json({ items });
}
