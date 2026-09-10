import { NextResponse } from "next/server";

import { readArchiveFile } from "@/lib/archive";

export const dynamic = "force-dynamic";

/**
 * Dev-only artifact passthrough for the archive checkout. Only files
 * under the configured archive root with an allowlisted extension are
 * served; traversal and dot-directory segments are rejected by the
 * reader. The prototype layout keeps this route out of production
 * builds entirely.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const segments = (await context.params).path ?? [];
  const file = readArchiveFile(segments.join("/"));
  if (!file) {
    return new NextResponse("Archive artifact not found.", { status: 404 });
  }
  return new NextResponse(new Uint8Array(file.content), {
    headers: {
      "Content-Type": file.contentType,
      "Cache-Control": "no-store",
    },
  });
}
