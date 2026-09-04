import { NextRequest, NextResponse } from "next/server";
import path from "node:path";

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

  const libraryRoots = getLibraryRoots();

  if (libraryRoots.length === 0) {
    return NextResponse.json(
      { error: "No library roots configured" },
      { status: 400 },
    );
  }

  const absoluteFolder = path.resolve(body.folderPath);
  const libraryRoot = libraryRoots.find((root) => {
    const relative = path.relative(path.resolve(root), absoluteFolder);
    return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
  });
  if (!libraryRoot) {
    return NextResponse.json(
      { error: "Folder is outside the configured Library roots" },
      { status: 400 },
    );
  }
  const directory = path.relative(path.resolve(libraryRoot), absoluteFolder) || null;
  const files = getFiles({
    libraryRoot,
    directory,
    atLibraryRoot: directory === null,
    showRemoved: false,
  });

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
