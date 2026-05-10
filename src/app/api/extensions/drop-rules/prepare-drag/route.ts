import os from "node:os";
import path from "node:path";

import { NextRequest, NextResponse } from "next/server";

import { createAppExtensionContext } from "@/lib/composition-root";
import { createService, manifest } from "@foleyard/drop-rules";

import { getFileById } from "@/lib/db";
import { isExtensionEnabled } from "@/lib/extensions/registry";
import { getExtensionSettingValue } from "@/lib/extensions/settings-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isExtensionEnabled("drop-rules")) {
    return NextResponse.json(
      { error: "Extension is disabled" },
      { status: 403 },
    );
  }

  const body = (await request.json()) as {
    fileId?: string;
  };

  if (!body.fileId) {
    return NextResponse.json({ error: "fileId is required" }, { status: 400 });
  }

  const file = getFileById(body.fileId);
  if (!file || file.removedAt) {
    return NextResponse.json({ error: "File is not indexed" }, { status: 404 });
  }

  const configuredStagingDirectory = stringSetting("drag-out-folder", "");
  const stagingDirectory = configuredStagingDirectory.trim()
    ? configuredStagingDirectory
    : path.join(os.tmpdir(), "foleyard-drop-rules");

  const context = createAppExtensionContext({
    permissions: manifest.permissions,
    selection: { fileIds: [file.id] },
  });

  try {
    const result = await createService(context).prepareDrag({
      stagingDirectory,
      file: {
        id: file.id,
        filename: file.filename,
        path: file.path,
        format: file.format,
      },
      copyOnDrop: booleanSetting("copy-on-drop", true),
      renameOnDrop: booleanSetting("rename-on-drop", true),
      renamePattern: stringSetting("rename-pattern", "{index}-{name}{ext}"),
      markUsed: booleanSetting("mark-used", true),
    });

    return NextResponse.json({
      file: {
        id: file.id,
        path: result.dragPath,
        filename: result.outputName,
        originalPath: result.originalPath,
        staged: result.staged,
        usedReportPath: result.usedReportPath,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to prepare drag file",
      },
      { status: 500 },
    );
  }
}

function booleanSetting(settingId: string, defaultValue: boolean) {
  const value = getExtensionSettingValue("drop-rules", settingId, defaultValue);
  return typeof value === "boolean" ? value : defaultValue;
}

function stringSetting(settingId: string, defaultValue: string) {
  const value = getExtensionSettingValue("drop-rules", settingId, defaultValue);
  return typeof value === "string" ? value : defaultValue;
}
