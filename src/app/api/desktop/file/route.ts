import { errorResponse } from "@/lib/api/errors";
import path from "node:path";

import { NextRequest, NextResponse } from 'next/server';

import { getOwnedFileById, getLibraryRoots } from '@/lib/db';
import { resolveReadablePath } from '@/lib/filesystem-boundary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const fileId = searchParams.get('id');

  if (!fileId) {
    return errorResponse('Missing file id', 400);
  }

  const file = getOwnedFileById(fileId);
  if (!file) {
    return errorResponse('File is not indexed', 404);
  }

  const resolved = await resolveReadablePath(file.path, getLibraryRoots());
  if (!resolved) {
    const parent = await resolveReadablePath(path.dirname(file.path), getLibraryRoots());
    return errorResponse(parent ? 'File no longer exists on disk' : 'File is outside the Library', 404);
  }

  return NextResponse.json({
    file: {
      id: file.id,
      path: resolved,
      filename: file.filename,
    },
  });
}
