import { errorResponse } from "@/lib/api/errors";
import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { registerGrant } from "@/lib/filesystem-boundary";
import { mintV2PickerProof } from "@/lib/extensions-v2/picker-proofs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GRANT_KINDS = ["source", "destination"] as const;

/**
 * POST /api/desktop/grants — the native folder picker reports the folder the
 * user chose. The desktop process authenticates with its startup secret; only
 * this route may mint a single-use picker proof. Body: `{ "path": string,
 * "extensionId"?: string, "grantKind"?: "source" | "destination" }`.
 *
 * With a purpose, the response carries an opaque proof the renderer spends at
 * `/api/extensions-v2/{grants,source-grants}`; it never carries the raw path as
 * consent. Without a purpose (Library-root browsing) it returns the canonical
 * path the renderer displays, and no proof.
 */
export async function POST(request: NextRequest) {
  const expected = process.env.FOLEYARD_GRANT_SECRET;
  const supplied = request.headers.get("x-foleyard-grant-secret");
  if (!expected || !supplied || Buffer.byteLength(expected) !== Buffer.byteLength(supplied) || !timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))) {
    return errorResponse("Only the desktop folder picker may grant access", 403);
  }
  try {
    const body = await request.json();
    if (typeof body?.path !== "string" || !body.path) return errorResponse("Directory path is required", 400);
    const registered = await registerGrant(body.path);

    const hasPurpose = body.extensionId !== undefined || body.grantKind !== undefined;
    if (!hasPurpose) {
      return NextResponse.json({ ok: true, path: registered.path });
    }
    if (typeof body.extensionId !== "string" || !body.extensionId.trim()) {
      return errorResponse("Picker purpose needs an extension id", 400);
    }
    if (!GRANT_KINDS.includes(body.grantKind)) {
      return errorResponse("Picker purpose needs grantKind source or destination", 400);
    }
    const proof = mintV2PickerProof(body.extensionId, body.grantKind, registered.path);
    return NextResponse.json({ ok: true, path: registered.path, proof: proof.proof });
  } catch (error) {
    console.error("Folder grant failed", error);
    return errorResponse("Could not grant access to the chosen directory", 400);
  }
}
