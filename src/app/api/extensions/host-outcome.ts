import { NextResponse } from "next/server";

import type {
  YardExtensionHostFailureReason,
  YardExtensionHostOutcome,
} from "@yard-core";

export function hostFailureStatus(
  reason: YardExtensionHostFailureReason,
): number {
  switch (reason) {
    case "extension-not-found":
    case "command-not-found":
      return 404;
    case "extension-disabled":
    case "permission-denied":
      return 403;
    case "validation-failed":
      return 400;
    case "execution-failed":
      return 500;
  }
}

export function hostOutcomeStatus(outcome: YardExtensionHostOutcome): number {
  return outcome.ok ? 200 : hostFailureStatus(outcome.reason);
}

export function toHostFailureResponse(
  outcome: YardExtensionHostOutcome,
): NextResponse {
  if (!outcome.ok && outcome.reason === "extension-disabled") {
    return NextResponse.json(
      { error: "Extension is disabled" },
      { status: 403 },
    );
  }

  if (!outcome.ok) {
    return NextResponse.json(
      { error: outcome.message },
      { status: hostFailureStatus(outcome.reason) },
    );
  }

  return NextResponse.json({ error: "Unexpected UI intent" }, { status: 500 });
}
