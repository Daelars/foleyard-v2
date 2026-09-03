import { isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/database/connection";
import { getLibraryRoots } from "@/lib/db";
import { createAppExtensionHost } from "@/lib/extensions/host";
import * as schema from "@/lib/schema";

import { toHostFailureResponse } from "../../host-outcome";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const allFiles = db
    .select({
      id: schema.files.id,
      path: schema.files.path,
      filename: schema.files.filename,
      directory: schema.files.directory,
      format: schema.files.format,
      duration: schema.files.duration,
      fileSize: schema.files.fileSize,
    })
    .from(schema.files)
    .where(isNull(schema.files.removedAt))
    .all();
  const libraryRoots = getLibraryRoots();

  if (libraryRoots.length === 0) {
    return NextResponse.json(
      { error: "No library roots configured" },
      { status: 400 },
    );
  }

  const outcome = await createAppExtensionHost().execute({
    extensionId: "folder-janitor",
    commandId: "folder-janitor.scan-library",
    input: {
      files: allFiles.map((f) => ({
        id: f.id,
        filename: f.filename,
        path: f.path,
        format: f.format,
        fileSize: f.fileSize,
        duration: f.duration,
      })),
      libraryRoots,
    },
  });

  if (outcome.ok && outcome.type === "value") {
    return NextResponse.json(outcome.value);
  }

  return toHostFailureResponse(outcome);
}
