import { errorResponse } from "@/lib/api/errors";
import { NextRequest, NextResponse } from "next/server";

import { createAppExtensionHost } from "@/lib/extensions/host";

import { toHostFailureResponse } from "../../host-outcome";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { name?: string; query?: string };
  const name = body.name?.trim();
  const query = body.query?.trim();

  if (!name || !query) {
    return errorResponse("name and query are required", 400);
  }

  const outcome = await createAppExtensionHost().execute<string>({
    extensionId: "smart-collections",
    commandId: "smart-collections.save-search",
    input: { name, filter: { q: query } },
  });

  if (outcome.ok && outcome.type === "value") {
    return NextResponse.json({ success: true, id: outcome.value });
  }

  return toHostFailureResponse(outcome);
}
