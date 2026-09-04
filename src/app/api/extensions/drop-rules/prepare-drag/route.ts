import { errorResponse } from "@/lib/api/errors";
import { resolveReadablePath } from "@/lib/filesystem-boundary";
import { NextRequest, NextResponse } from "next/server";

import { getFileById, getLibraryRoots } from "@/lib/db";
import { createAppExtensionHost } from "@/lib/extensions/host";

import { toHostFailureResponse } from "../../host-outcome";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    fileId?: string;
  };

  if (!body.fileId) {
    return errorResponse("fileId is required", 400);
  }

  const file = getFileById(body.fileId);
  if (!file || file.removedAt) {
    return errorResponse("File is not indexed", 404);
  }

  const readable = await resolveReadablePath(file.path, getLibraryRoots());
  if (!readable) return errorResponse("Source is outside the configured Library roots", 403);
  const outcome = await createAppExtensionHost().execute({
    extensionId: "drop-rules",
    commandId: "drop-rules.prepare-drag",
    selection: { fileIds: [file.id] },
    input: {
      file: {
        id: file.id,
        filename: file.filename,
        path: readable,
        format: file.format,
      },
    },
  });

  if (!outcome.ok) {
    return toHostFailureResponse(outcome);
  }

  if (outcome.type !== "value") {
    return errorResponse("Unexpected UI intent", 500);
  }

  const result = outcome.value as {
    dragPath: string;
    outputName: string;
    originalPath: string;
    staged: boolean;
    usedReportPath: string | null;
  };
  return NextResponse.json({
    file: {
      id: file.id,
      path: result.dragPath,
      filename: result.outputName,
      originalPath: result.originalPath,
      staged: result.staged,
      usedReportPath: result.usedReportPath,
    },
  });
}
