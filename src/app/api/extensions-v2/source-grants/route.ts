import { NextRequest, NextResponse } from "next/server";

import { getV2Registry } from "@/lib/extensions-v2/host";
import { issueV2GrantFromPickerProof } from "@/lib/extensions-v2/picker-proofs";

export const dynamic = "force-dynamic";

/**
 * POST /api/extensions-v2/source-grants — spend a desktop-picker proof for
 * a readable source grant owed to one extension.
 * Body: `{ "extensionId": string, "proof": string }`.
 * The native picker minted the single-use proof after the user chose a
 * folder; this route exchanges it for the grant ID handlers consume. A
 * caller-supplied directory path is not accepted: a path only becomes
 * access through a proof the picker actually issued.
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
  const proof = (body as { proof?: unknown })?.proof;
  if (typeof extensionId !== "string" || !extensionId.trim()) {
    return NextResponse.json(
      { ok: false, error: { code: "input-invalid", message: "Body needs { extensionId: string, proof: string }." } },
      { status: 400 },
    );
  }
  if (typeof proof !== "string" || !proof.trim()) {
    return NextResponse.json(
      { ok: false, error: { code: "input-invalid", message: "Body needs { extensionId: string, proof: string }." } },
      { status: 400 },
    );
  }
  if (!getV2Registry().get(extensionId)) {
    return NextResponse.json(
      { ok: false, error: { code: "extension-unknown", message: `Unknown v2 extension "${extensionId}".` } },
      { status: 404 },
    );
  }
  const issued = await issueV2GrantFromPickerProof(extensionId, "source", proof);
  if (!issued.ok) {
    return NextResponse.json(
      { ok: false, error: { code: issued.code, message: issued.message } },
      { status: issued.status },
    );
  }
  return NextResponse.json({ ok: true, grantId: issued.grantId, path: issued.path });
}
