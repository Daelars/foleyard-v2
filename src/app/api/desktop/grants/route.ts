import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { registerGrant } from "@/lib/filesystem-boundary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const expected = process.env.FOLEYARD_GRANT_SECRET;
  const supplied = request.headers.get("x-foleyard-grant-secret");
  if (!expected || !supplied || Buffer.byteLength(expected) !== Buffer.byteLength(supplied) || !timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))) {
    return NextResponse.json({ error: "Only the desktop folder picker may grant access" }, { status: 403 });
  }
  try {
    const body = await request.json();
    if (typeof body?.path !== "string" || !body.path) return NextResponse.json({ error: "Directory path is required" }, { status: 400 });
    return NextResponse.json({ ok: true, ...await registerGrant(body.path) });
  } catch (error) {
    console.error("Folder grant failed", error);
    return NextResponse.json({ error: "Could not grant access to the chosen directory" }, { status: 400 });
  }
}
