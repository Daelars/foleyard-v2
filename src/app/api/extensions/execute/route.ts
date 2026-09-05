import { errorResponse } from "@/lib/api/errors";
import { NextRequest, NextResponse } from "next/server";

import { createAppExtensionHost } from "@/lib/extensions/host";

import { hostOutcomeStatus } from "../host-outcome";
import {
  resolveCommandTransport,
  type ExecuteTransportBody,
} from "./transport";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as ExecuteTransportBody;

  if (!body.extensionId || !body.commandId) {
    return errorResponse("extensionId and commandId are required", 400);
  }

  const transport = await resolveCommandTransport(body);
  if (!transport.ok) {
    return errorResponse(transport.message, transport.status);
  }

  const outcome = await createAppExtensionHost(
    transport.destinationGrant,
  ).execute({
    extensionId: body.extensionId,
    commandId: body.commandId,
    selection: transport.selection ?? body.selection,
    input: transport.inputProvided ? transport.input : body.input,
  });

  if (!outcome.ok) {
    return NextResponse.json(outcome, { status: hostOutcomeStatus(outcome) });
  }

  if (outcome.type === "ui-intent") {
    return NextResponse.json(outcome);
  }

  const value = transport.shapeResult
    ? await transport.shapeResult(outcome.value)
    : outcome.value;

  return NextResponse.json({ ok: true, type: "value", value });
}
