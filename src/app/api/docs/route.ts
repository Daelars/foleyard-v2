import { NextResponse } from "next/server";

import { getDocumentationLocation, listDocumentIds } from "@/lib/documentation";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ...getDocumentationLocation(), ids: listDocumentIds() });
}
