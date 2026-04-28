import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import { getFileById } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const pathParam = searchParams.get('path');

  let filePath: string | null = null;

  if (id) {
    const file = getFileById(id);
    if (file) filePath = file.path;
  } else if (pathParam) {
    filePath = decodeURIComponent(pathParam);
  }

  if (!filePath) {
    return NextResponse.json({ error: 'No file identified' }, { status: 400 });
  }

  try {
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const stat = fs.statSync(filePath);
    const range = request.headers.get('range');
    const ext = filePath.split('.').pop()?.toLowerCase() || 'mp3';
    const mimeTypes: Record<string, string> = {
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      ogg: 'audio/ogg',
      flac: 'audio/flac',
      aiff: 'audio/aiff',
      aac: 'audio/aac',
      m4a: 'audio/mp4',
    };
    const contentType = mimeTypes[ext] || 'audio/mpeg';

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      const chunksize = (end - start) + 1;
      const file = fs.createReadStream(filePath, { start, end });
      
      const head = {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': contentType,
      };

      // @ts-expect-error - ReadableStream conversion
      return new NextResponse(file, { headers: head, status: 206 });
    } else {
      const head = {
        'Content-Length': stat.size,
        'Content-Type': contentType,
      };
      const file = fs.createReadStream(filePath);
      // @ts-expect-error - ReadableStream conversion
      return new NextResponse(file, { headers: head });
    }
  } catch (err) {
    console.error("Audio stream error:", err);
    return NextResponse.json({ error: 'Failed to read file' }, { status: 500 });
  }
}
