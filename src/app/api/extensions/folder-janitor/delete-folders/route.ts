import { errorResponse } from "@/lib/api/errors";
import { NextRequest, NextResponse } from "next/server";

import { getLibraryRoots } from "@/lib/db";
import { createAppExtensionHost } from "@/lib/extensions/host";

import { toHostFailureResponse } from "../../host-outcome";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { paths?: string[] };

  if (!body.paths?.length) {
    return errorResponse("paths array is required", 400);
  }

  const libraryRoots = getLibraryRoots();
  if (libraryRoots.length === 0) {
    return errorResponse("No library roots configured", 400);
  }

  const outcome = await createAppExtensionHost().execute({
    extensionId: "folder-janitor",
    commandId: "folder-janitor.delete-folders",
    input: { paths: body.paths, libraryRoots },
  });

  if (outcome.ok && outcome.type === "value") {
    return NextResponse.json(outcome.value);
  }

  return toHostFailureResponse(outcome);
}
