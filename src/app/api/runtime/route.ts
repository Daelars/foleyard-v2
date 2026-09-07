import { NextResponse } from "next/server";

import { getServerRuntimeSnapshot } from "@/lib/runtime-info";

export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = getServerRuntimeSnapshot();
  return NextResponse.json(snapshot);
}
