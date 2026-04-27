import { NextRequest, NextResponse } from 'next/server';
import { attachTagToFile, createTag, detachTagFromFile, getAllTags, getTagsForFile } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const fileId = searchParams.get('fileId');

  if (fileId) {
    return NextResponse.json({ tags: getTagsForFile(fileId) });
  }

  return NextResponse.json({ tags: getAllTags() });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, fileId, tagId } = body;

    if (fileId && tagId) {
      attachTagToFile(fileId, tagId);
      return NextResponse.json({ success: true });
    }

    if (name) {
      const id = createTag(name);
      return NextResponse.json({ success: true, id });
    }

    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Request failed' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { fileId, tagId } = body;

    if (fileId && tagId) {
      detachTagFromFile(fileId, tagId);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Request failed' }, { status: 500 });
  }
}
