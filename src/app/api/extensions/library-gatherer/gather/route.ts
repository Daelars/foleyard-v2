import { NextRequest, NextResponse } from "next/server";

import { createAppExtensionHost } from "@/lib/extensions/host";

import { toHostFailureResponse } from "../../host-outcome";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    sourceDirectories?: string[];
    destinationDirectory?: string;
  };

  if (!body.sourceDirectories?.length) {
    return NextResponse.json(
      { error: "sourceDirectories array is required" },
      { status: 400 },
    );
  }

  if (!body.destinationDirectory) {
    return NextResponse.json(
      { error: "destinationDirectory is required" },
      { status: 400 },
    );
  }

  const outcome = await createAppExtensionHost().execute({
    extensionId: "library-gatherer",
    commandId: "library-gatherer.gather",
    input: {
      sourceDirectories: body.sourceDirectories,
      destinationDirectory: body.destinationDirectory,
    },
  });

  if (outcome.ok && outcome.type === "value") {
    return NextResponse.json(outcome.value);
  }

  return toHostFailureResponse(outcome);
}
