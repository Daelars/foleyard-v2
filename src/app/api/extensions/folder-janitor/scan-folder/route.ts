import { errorResponse } from "@/lib/api/errors";
import { resolveReadablePath } from "@/lib/filesystem-boundary";
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
    return errorResponse("folderPath is required", 400);
  }

  const libraryRoots = getLibraryRoots();

  if (libraryRoots.length === 0) {
    return errorResponse("No library roots configured", 400);
  }

  const absoluteFolder = await resolveReadablePath(body.folderPath, libraryRoots);
  let libraryRoot: string | undefined;
  if (absoluteFolder) {
    for (const root of libraryRoots) {
      if (await resolveReadablePath(absoluteFolder, [root])) { libraryRoot = root; break; }
    }
  }
  if (!libraryRoot || !absoluteFolder) {
    return errorResponse("Folder is outside the configured Library roots", 400);
  }
  const directory = path.relative(path.resolve(libraryRoot), absoluteFolder) || null;
  const files = getFiles({
    libraryRoot,
    directory,
    atLibraryRoot: directory === null,
    showRemoved: false,
    limit: -1,
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
