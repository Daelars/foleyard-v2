import { NextRequest, NextResponse } from 'next/server';
import {
  attachFileToCollection,
  createCollection,
  deleteCollection,
  detachFileFromCollection,
  getAllCollections,
  getFiles,
} from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const collectionId = searchParams.get('collectionId');

  if (collectionId) {
    return NextResponse.json({ files: getFiles({ collectionId }) });
  }

  return NextResponse.json({ collections: getAllCollections() });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, fileId, collectionId } = body;

    if (fileId && collectionId) {
      attachFileToCollection(fileId, collectionId);
      return NextResponse.json({ success: true });
    }

    const trimmedName = typeof name === 'string' ? name.trim() : '';

    if (trimmedName) {
      const id = createCollection(trimmedName);
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
    const { fileId, collectionId } = body;

    if (fileId && collectionId) {
      detachFileFromCollection(fileId, collectionId);
      return NextResponse.json({ success: true });
    }

    if (collectionId) {
      deleteCollection(collectionId);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Request failed' }, { status: 500 });
  }
}
