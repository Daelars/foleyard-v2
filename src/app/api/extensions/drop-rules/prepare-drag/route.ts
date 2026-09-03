import { NextRequest, NextResponse } from "next/server";

import { getFileById } from "@/lib/db";
import { createAppExtensionHost } from "@/lib/extensions/host";

import { toHostFailureResponse } from "../../host-outcome";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    fileId?: string;
  };

  if (!body.fileId) {
    return NextResponse.json({ error: "fileId is required" }, { status: 400 });
  }

  const file = getFileById(body.fileId);
  if (!file || file.removedAt) {
    return NextResponse.json({ error: "File is not indexed" }, { status: 404 });
  }

  const outcome = await createAppExtensionHost().execute({
    extensionId: "drop-rules",
    commandId: "drop-rules.prepare-drag",
    selection: { fileIds: [file.id] },
    input: {
      file: {
        id: file.id,
        filename: file.filename,
        path: file.path,
        format: file.format,
      },
    },
  });

  if (!outcome.ok) {
    return toHostFailureResponse(outcome);
  }

  if (outcome.type !== "value") {
    return NextResponse.json({ error: "Unexpected UI intent" }, { status: 500 });
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
