import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";

import { NextRequest, NextResponse } from "next/server";

import { getFileById, getLibraryRoots } from "@/lib/db";
import { recordRecentMakePackFile } from "@/lib/extensions/make-pack-recent-store";
import { resolveExistingPathWithinRoots } from "@/lib/filesystem-boundary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIME_TYPES: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
  ".aif": "audio/aiff",
  ".aiff": "audio/aiff",
  ".aac": "audio/aac",
  ".m4a": "audio/mp4",
};

type ByteRange = { start: number; end: number };

function parseByteRange(value: string, size: number): ByteRange | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2]) || size <= 0) return null;

  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    return { start: Math.max(0, size - suffixLength), end: size - 1 };
  }

  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(requestedEnd) ||
    start < 0 ||
    start >= size ||
    requestedEnd < start
  ) {
    return null;
  }

  return { start, end: Math.min(requestedEnd, size - 1) };
}

function streamResponse(
  request: NextRequest,
  filePath: string,
  headers: Record<string, string | number>,
  range?: ByteRange,
) {
  const file = fs.createReadStream(filePath, range);
  const abort = () => file.destroy();
  request.signal.addEventListener("abort", abort, { once: true });
  file.once("close", () => request.signal.removeEventListener("abort", abort));
  return new NextResponse(Readable.toWeb(file) as ReadableStream, {
    status: range ? 206 : 200,
    headers,
  });
}

export async function GET(request: NextRequest) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "No file identified" }, { status: 400 });
  }

  const indexedFile = getFileById(id);
  if (!indexedFile || indexedFile.removedAt) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  try {
    const filePath = await resolveExistingPathWithinRoots(
      indexedFile.path,
      getLibraryRoots(),
    );
    if (!filePath) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const stat = await fs.promises.stat(filePath);
    if (!stat.isFile()) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const contentType = MIME_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
    const rangeHeader = request.headers.get("range");
    recordRecentMakePackFile(indexedFile.id);

    if (rangeHeader) {
      const range = parseByteRange(rangeHeader, stat.size);
      if (!range) {
        return new NextResponse(null, {
          status: 416,
          headers: {
            "Accept-Ranges": "bytes",
            "Content-Range": `bytes */${stat.size}`,
          },
        });
      }

      return streamResponse(request, filePath, {
        "Accept-Ranges": "bytes",
        "Content-Length": range.end - range.start + 1,
        "Content-Range": `bytes ${range.start}-${range.end}/${stat.size}`,
        "Content-Type": contentType,
      }, range);
    }

    return streamResponse(request, filePath, {
      "Accept-Ranges": "bytes",
      "Content-Length": stat.size,
      "Content-Type": contentType,
    });
  } catch (error) {
    console.error("Audio stream error:", error);
    return NextResponse.json({ error: "Failed to read file" }, { status: 500 });
  }
}
