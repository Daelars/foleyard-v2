import { errorResponse } from "@/lib/api/errors";
import { NextRequest, NextResponse } from "next/server";

import { createAppExtensionHost } from "@/lib/extensions/host";

import { hostOutcomeStatus } from "../host-outcome";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    extensionId?: string;
    commandId?: string;
    selection?: {
      fileIds?: string[];
      folderPath?: string;
      collectionId?: string;
    };
    input?: unknown;
  };

  if (!body.extensionId || !body.commandId) {
    return errorResponse("extensionId and commandId are required", 400);
  }

  if (body.input !== undefined) {
    return errorResponse("Command input must use its dedicated endpoint", 400);
  }

  const outcome = await createAppExtensionHost().execute({
    extensionId: body.extensionId,
    commandId: body.commandId,
    selection: body.selection,
    input: body.input,
  });

  if (outcome.ok) {
    return NextResponse.json(outcome);
  }

  return NextResponse.json(outcome, { status: hostOutcomeStatus(outcome) });
}
