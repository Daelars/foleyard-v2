import { errorResponse } from "@/lib/api/errors";
import { NextRequest, NextResponse } from "next/server";

import { createAppExtensionHost } from "@/lib/extensions/host";

import { toHostFailureResponse } from "../../host-outcome";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { fileIds?: string[] };
  const fileIds = body.fileIds;

  if (!fileIds || !Array.isArray(fileIds)) {
    return errorResponse("fileIds array required", 400);
  }

  const outcome = await createAppExtensionHost().execute({
    extensionId: "sound-shelf",
    commandId: "sound-shelf.remove-selected",
    selection: { fileIds },
  });

  if (outcome.ok && outcome.type === "value") {
    return NextResponse.json(outcome.value);
  }

  return toHostFailureResponse(outcome);
}
