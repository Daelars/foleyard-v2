import { resolveReadablePath, resolveWritablePath } from "@/lib/filesystem-boundary";
import { NextRequest, NextResponse } from "next/server";

import type { MakePackFile } from "@foleyard/make-pack";

import { getFileById, getLibraryRoots } from "@/lib/db";
import { createAppExtensionHost } from "@/lib/extensions/host";
import { getRecentMakePackFileIds } from "@/lib/extensions/make-pack-recent-store";
import { DbSoundShelfStore } from "@/lib/extensions/sound-shelf-store";

import { toHostFailureResponse } from "../host-outcome";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function hydrateFiles(fileIds: string[]): MakePackFile[] {
  const seen = new Set<string>();
  const files: MakePackFile[] = [];

  for (const fileId of fileIds) {
    if (seen.has(fileId)) {
      continue;
    }

    seen.add(fileId);
    const file = getFileById(fileId);
    if (!file || file.removedAt) {
      continue;
    }

    files.push({
      id: file.id,
      filename: file.filename,
      path: file.path,
      duration: file.duration,
      format: file.format,
      fileSize: file.fileSize,
    });
  }

  return files;
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    source?: "selection" | "shelf" | "recent";
    fileIds?: string[];
    destinationDirectory?: string;
    destinationGrant?: string;
    packName?: string;
    outputFormat?: "folder" | "zip";
  };

  if (!body.source || !["selection", "shelf", "recent"].includes(body.source)) {
    return NextResponse.json({ error: "Valid source is required" }, { status: 400 });
  }

  if (typeof body.destinationDirectory !== "string" || !body.destinationDirectory) {
    return NextResponse.json(
      { error: "destinationDirectory is required" },
      { status: 400 },
    );
  }

  const destination = typeof body.destinationGrant === "string" ? await resolveWritablePath(body.destinationDirectory, body.destinationGrant) : null;
  if (!destination) return NextResponse.json({ error: "Destination is outside a granted directory. Choose it with the folder picker." }, { status: 403 });
  if (body.fileIds !== undefined && (!Array.isArray(body.fileIds) || !body.fileIds.every((id) => typeof id === "string"))) return NextResponse.json({ error: "fileIds must be an array of strings" }, { status: 400 });

  const fileIds =
    body.source === "shelf"
      ? new DbSoundShelfStore().getFileIds()
      : body.source === "recent"
        ? getRecentMakePackFileIds()
        : (body.fileIds ?? []);

  if (fileIds.length === 0) {
    return NextResponse.json(
      { error: "No sounds found for that pack source" },
      { status: 400 },
    );
  }

  const files = hydrateFiles(fileIds);
  for (const file of files) {
    const readable = await resolveReadablePath(file.path, getLibraryRoots());
    if (!readable) return NextResponse.json({ error: "Source is outside the configured Library roots" }, { status: 403 });
    file.path = readable;
  }

  const commandId = `make-pack.from-${body.source}`;
  const outcome = await createAppExtensionHost(body.destinationGrant).execute({
    extensionId: "make-pack",
    commandId,
    selection: { fileIds },
    input: {
      files,
      destinationDirectory: destination,
      packName: body.packName,
      outputFormat: body.outputFormat,
    },
  });

  if (outcome.ok && outcome.type === "value") {
    return NextResponse.json(outcome.value);
  }

  return toHostFailureResponse(outcome);
}
