import { NextResponse } from "next/server";

import { createAppExtensionHost } from "@/lib/extensions/host";

import { toHostFailureResponse } from "../../host-outcome";

export const dynamic = "force-dynamic";

export async function POST() {
  const outcome = await createAppExtensionHost().execute({
    extensionId: "sound-shelf",
    commandId: "sound-shelf.clear",
  });

  if (outcome.ok && outcome.type === "value") {
    return NextResponse.json(outcome.value);
  }

  return toHostFailureResponse(outcome);
}
