import { NextRequest, NextResponse } from "next/server";

import { createAppExtensionContext } from "@/lib/composition-root";
import { createService, manifest } from "@foleyard/library-gatherer";

import { isExtensionEnabled } from "@/lib/extensions/registry";
import { getExtensionSettingValue } from "@/lib/extensions/settings-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isExtensionEnabled("library-gatherer")) {
    return NextResponse.json(
      { error: "Extension is disabled" },
      { status: 403 },
    );
  }

  const body = (await request.json()) as {
    sourceDirectories?: string[];
    destinationDirectory?: string;
  };

  if (!body.sourceDirectories?.length) {
    return NextResponse.json(
      { error: "sourceDirectories array is required" },
      { status: 400 },
    );
  }

  if (!body.destinationDirectory) {
    return NextResponse.json(
      { error: "destinationDirectory is required" },
      { status: 400 },
    );
  }

  const preserveFolderNames = getExtensionSettingValue(
    "library-gatherer",
    "preserve-folder-names",
    true,
  );
  const skipDuplicates = getExtensionSettingValue(
    "library-gatherer",
    "skip-duplicates",
    true,
  );

  const context = createAppExtensionContext({
    permissions: manifest.permissions,
  });

  try {
    const result = await createService(context).gather({
      sourceDirectories: body.sourceDirectories,
      destinationDirectory: body.destinationDirectory,
      preserveFolderNames:
        typeof preserveFolderNames === "boolean" ? preserveFolderNames : true,
      skipDuplicates:
        typeof skipDuplicates === "boolean" ? skipDuplicates : true,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to gather library",
      },
      { status: 500 },
    );
  }
}
