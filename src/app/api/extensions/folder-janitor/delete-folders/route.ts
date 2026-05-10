import fs from "node:fs";

import { NextRequest, NextResponse } from "next/server";

import { isExtensionEnabled } from "@/lib/extensions/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isExtensionEnabled("folder-janitor")) {
    return NextResponse.json(
      { error: "Extension is disabled" },
      { status: 403 },
    );
  }

  const body = (await request.json()) as { paths?: string[] };

  if (!body.paths?.length) {
    return NextResponse.json(
      { error: "paths array is required" },
      { status: 400 },
    );
  }

  const results: { path: string; ok: boolean; error?: string }[] = [];

  for (const dirPath of body.paths) {
    try {
      fs.rmdirSync(dirPath);
      results.push({ path: dirPath, ok: true });
    } catch (error) {
      results.push({
        path: dirPath,
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return NextResponse.json({ results });
}
