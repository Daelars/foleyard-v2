import { isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { createAppExtensionContext } from "@/lib/composition-root";
import { createService, manifest } from "@foleyard/folder-janitor";

import { db } from "@/lib/database/connection";
import { getLibraryRoots } from "@/lib/db";
import { isExtensionEnabled } from "@/lib/extensions/registry";
import { getExtensionSettingValue } from "@/lib/extensions/settings-store";
import * as schema from "@/lib/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  if (!isExtensionEnabled("folder-janitor")) {
    return NextResponse.json(
      { error: "Extension is disabled" },
      { status: 403 },
    );
  }

  const allFiles = db
    .select({
      id: schema.files.id,
      path: schema.files.path,
      filename: schema.files.filename,
      directory: schema.files.directory,
      format: schema.files.format,
      duration: schema.files.duration,
      fileSize: schema.files.fileSize,
    })
    .from(schema.files)
    .where(isNull(schema.files.removedAt))
    .all();
  const libraryRoots = getLibraryRoots();

  if (libraryRoots.length === 0) {
    return NextResponse.json(
      { error: "No library roots configured" },
      { status: 400 },
    );
  }

  const tinyThreshold = getExtensionSettingValue(
    "folder-janitor",
    "tiny-file-threshold-bytes",
    1024,
  );
  const allowedFormatsRaw = getExtensionSettingValue(
    "folder-janitor",
    "allowed-formats",
    "wav,aif,aiff,mp3,flac,ogg,m4a,aac",
  );
  const allowedFormats =
    typeof allowedFormatsRaw === "string"
      ? allowedFormatsRaw.split(",").map((f) => f.trim())
      : ["wav", "aif", "aiff", "mp3", "flac", "ogg", "m4a", "aac"];

  const context = createAppExtensionContext({
    permissions: manifest.permissions,
  });

  try {
    const result = await createService(context).scan({
      files: allFiles.map((f) => ({
        id: f.id,
        filename: f.filename,
        path: f.path,
        format: f.format,
        fileSize: f.fileSize,
        duration: f.duration,
      })),
      libraryRoots,
      tinyFileThresholdBytes:
        typeof tinyThreshold === "number"
          ? tinyThreshold
          : 1024,
      allowedFormats,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to scan library",
      },
      { status: 500 },
    );
  }
}
