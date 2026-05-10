import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { isExtensionEnabled } from "@/lib/extensions/registry";
import { db } from "@/lib/database/connection";
import * as schema from "@/lib/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isExtensionEnabled("folder-janitor")) {
    return NextResponse.json(
      { error: "Extension is disabled" },
      { status: 403 },
    );
  }

  const body = (await request.json()) as { fileIds?: string[] };

  if (!body.fileIds?.length) {
    return NextResponse.json(
      { error: "fileIds array is required" },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();

  for (const fileId of body.fileIds) {
    db.update(schema.files)
      .set({ removedAt: now })
      .where(eq(schema.files.id, fileId))
      .run();
  }

  return NextResponse.json({ removed: body.fileIds.length });
}
