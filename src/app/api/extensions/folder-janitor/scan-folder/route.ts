import { NextRequest, NextResponse } from "next/server";

import { getFiles, getLibraryRoots } from "@/lib/db";
import { createAppExtensionHost } from "@/lib/extensions/host";

import { toHostFailureResponse } from "../../host-outcome";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
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

  const outcome = await createAppExtensionHost().execute({
    extensionId: "folder-janitor",
    commandId: "folder-janitor.scan-folder",
    selection: { folderPath: body.folderPath },
    input: {
      files: files.map((f) => ({
        id: f.id,
        filename: f.filename,
        path: f.path,
        format: f.format,
        fileSize: f.fileSize,
        duration: f.duration,
      })),
      libraryRoots,
    },
  });

  if (outcome.ok && outcome.type === "value") {
    return NextResponse.json(outcome.value);
  }

  return toHostFailureResponse(outcome);
}
