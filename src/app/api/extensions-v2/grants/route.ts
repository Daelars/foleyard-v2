import { NextRequest, NextResponse } from "next/server";

import { getV2Registry } from "@/lib/extensions-v2/host";
import { issueV2DestinationGrant } from "@/lib/extensions-v2/filesystem";

export const dynamic = "force-dynamic";

/**
 * POST /api/extensions-v2/grants — bridge a user-picked destination
 * folder into a core destination grant for one extension.
 * Body: `{ "extensionId": string, "directoryPath": string }`.
 * The picker itself runs in the renderer (desktop folder picker);
 * this route canonicalizes the picked directory and issues the
 * grant ID handlers consume. Grant tokens never leave the server.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "input-invalid", message: "Request body must be valid JSON." } },
      { status: 400 },
    );
  }
  const extensionId = (body as { extensionId?: unknown })?.extensionId;
  const directoryPath = (body as { directoryPath?: unknown })?.directoryPath;
  if (typeof extensionId !== "string" || !extensionId.trim()) {
    return NextResponse.json(
      { ok: false, error: { code: "input-invalid", message: "Body needs { extensionId: string, directoryPath: string }." } },
      { status: 400 },
    );
  }
  if (typeof directoryPath !== "string" || !directoryPath.trim()) {
    return NextResponse.json(
      { ok: false, error: { code: "input-invalid", message: "Body needs { extensionId: string, directoryPath: string }." } },
      { status: 400 },
    );
  }
  if (!getV2Registry().get(extensionId)) {
    return NextResponse.json(
      { ok: false, error: { code: "extension-unknown", message: `Unknown v2 extension "${extensionId}".` } },
      { status: 404 },
    );
  }
  try {
    const issued = await issueV2DestinationGrant(extensionId, directoryPath);
    return NextResponse.json({ ok: true, grantId: issued.grantId, path: issued.path });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "input-invalid",
          message: error instanceof Error ? error.message : String(error),
        },
      },
      { status: 400 },
    );
  }
}
