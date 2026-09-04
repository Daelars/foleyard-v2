import { errorResponse } from "@/lib/api/errors";
import { getLibraryRoots } from "@/lib/db";
import { resolveReadablePath, resolveWritablePath } from "@/lib/filesystem-boundary";
import { NextRequest, NextResponse } from "next/server";

import { createAppExtensionHost } from "@/lib/extensions/host";

import { toHostFailureResponse } from "../../host-outcome";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    sourceDirectories?: string[];
    destinationDirectory?: string;
    destinationGrant?: string;
  };

  if (!Array.isArray(body.sourceDirectories) || !body.sourceDirectories.length || !body.sourceDirectories.every((value) => typeof value === "string")) {
    return errorResponse("sourceDirectories array is required", 400);
  }

  if (typeof body.destinationDirectory !== "string" || !body.destinationDirectory) {
    return errorResponse("destinationDirectory is required", 400);
  }

  const destination = typeof body.destinationGrant === "string" ? await resolveWritablePath(body.destinationDirectory, body.destinationGrant) : null;
  if (!destination) return errorResponse("Destination is outside a granted directory. Choose it with the folder picker.", 403);
  const sources = await Promise.all(body.sourceDirectories.map((source) => resolveReadablePath(source, getLibraryRoots())));
  if (sources.some((source) => source === null)) return errorResponse("Source is outside the configured Library roots", 403);

  const outcome = await createAppExtensionHost(body.destinationGrant).execute({
    extensionId: "library-gatherer",
    commandId: "library-gatherer.gather",
    input: {
      sourceDirectories: sources,
      destinationDirectory: destination,
    },
  });

  if (outcome.ok && outcome.type === "value") {
    return NextResponse.json(outcome.value);
  }

  return toHostFailureResponse(outcome);
}
