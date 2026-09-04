import { errorResponse } from "@/lib/api/errors";
import fs from 'fs';

import { NextRequest, NextResponse } from 'next/server';

import { getFileById } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const fileId = searchParams.get('id');

  if (!fileId) {
    return errorResponse('Missing file id', 400);
  }

  const file = getFileById(fileId);
  if (!file || file.removedAt) {
    return errorResponse('File is not indexed', 404);
  }

  if (!fs.existsSync(file.path)) {
    return errorResponse('File no longer exists on disk', 404);
  }

  return NextResponse.json({
    file: {
      id: file.id,
      path: file.path,
      filename: file.filename,
    },
  });
}
