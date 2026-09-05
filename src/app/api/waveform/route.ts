import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/errors";
import { parsePageInteger } from "@/lib/api/pagination";
import { getFileById, getLibraryRoots } from "@/lib/db";
import { resolveExistingPathWithinRoots } from "@/lib/filesystem-boundary";
import { getWaveformPeaks } from "@/lib/waveform-cache";
import { resizeWaveform } from "@/lib/waveform-generator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const fileId = searchParams.get("id");
  if (!fileId) return errorResponse("No file id provided", 400);
  const peakCount = parsePageInteger(searchParams.get("peaks"), 180, 32, 512);
  if (peakCount === null) return errorResponse("Peaks must be an integer between 32 and 512", 400);
  const file = getFileById(fileId);
  if (!file || file.removedAt) return errorResponse("File not found", 404);
  try {
    const filePath = await resolveExistingPathWithinRoots(file.path, getLibraryRoots());
    if (!filePath) return errorResponse("File not found", 404);
    const waveform = await getWaveformPeaks(filePath);
    return NextResponse.json({ ...waveform, peaks: resizeWaveform(waveform.peaks, peakCount) });
  } catch (error) {
    console.error("Waveform generation error:", error);
    return errorResponse("Failed to generate waveform", 500);
  }
}
