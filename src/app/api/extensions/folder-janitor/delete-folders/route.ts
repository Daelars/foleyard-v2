import { NextRequest, NextResponse } from "next/server";

import { createAppExtensionHost } from "@/lib/extensions/host";

import { toHostFailureResponse } from "../../host-outcome";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { paths?: string[] };

  if (!body.paths?.length) {
    return NextResponse.json(
      { error: "paths array is required" },
      { status: 400 },
    );
  }

  const outcome = await createAppExtensionHost().execute({
    extensionId: "folder-janitor",
    commandId: "folder-janitor.delete-folders",
    input: { paths: body.paths },
  });

  if (outcome.ok && outcome.type === "value") {
    return NextResponse.json(outcome.value);
  }

  return toHostFailureResponse(outcome);
}
