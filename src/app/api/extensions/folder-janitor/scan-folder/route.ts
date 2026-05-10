import { NextRequest, NextResponse } from "next/server";

import { createAppExtensionContext } from "@/lib/composition-root";
import { createService, manifest } from "@foleyard/folder-janitor";

import { getFiles, getLibraryRoots } from "@/lib/db";
import { isExtensionEnabled } from "@/lib/extensions/registry";
import { getExtensionSettingValue } from "@/lib/extensions/settings-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isExtensionEnabled("folder-janitor")) {
    return NextResponse.json(
      { error: "Extension is disabled" },
      { status: 403 },
    );
  }

  const body = (await request.json()) as { folderPath?: string };

  if (!body.folderPath) {
    return NextResponse.json(
      { error: "folderPath is required" },
      { status: 400 },
    );
  }

  const files = getFiles({ directory: body.folderPath, showRemoved: false });
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
      files: files.map((f) => ({
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
            : "Failed to scan folder",
      },
      { status: 500 },
    );
  }
}
