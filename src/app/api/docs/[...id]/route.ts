import { NextResponse } from "next/server";

import { readDocumentation } from "@/lib/documentation";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string[] }> },
) {
  const segments = (await context.params).id ?? [];
  const documentId = segments.join("/");
  try {
    const doc = readDocumentation(documentId);
    return NextResponse.json(doc);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown document.";
    const status = message.startsWith("Unknown document") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
