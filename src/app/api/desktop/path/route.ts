import { NextRequest, NextResponse } from "next/server";

import { getLibraryRoots } from "@/lib/db";
import { resolveGrantedExistingPath, resolveExistingPathWithinRoots } from "@/lib/filesystem-boundary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { path?: string };
  if (typeof body.path !== "string" || !body.path) {
    return NextResponse.json({ error: "Path is required" }, { status: 400 });
  }

  const resolvedPath = await resolveGrantedExistingPath(body.path) ?? await resolveExistingPathWithinRoots(
    body.path,
    getLibraryRoots(),
  );
  if (!resolvedPath) {
    return NextResponse.json({ error: "Path is outside the Library" }, { status: 404 });
  }

  return NextResponse.json({ path: resolvedPath });
}
