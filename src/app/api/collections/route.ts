import { NextRequest, NextResponse } from 'next/server';
import {
  attachFileToCollection,
  convertToRegularCollection,
  createCollection,
  deleteCollection,
  detachFileFromCollection,
  getAllCollections,
  getFiles,
  renameCollection,
  updateCollectionColor,
  updateCollectionFilter,
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
    const { name, fileId, collectionId, isSmart, filter } = body;

    if (fileId && collectionId) {
      attachFileToCollection(fileId, collectionId);
      return NextResponse.json({ success: true });
    }

    const trimmedName = typeof name === 'string' ? name.trim() : '';

    if (trimmedName) {
      const id = createCollection(trimmedName, !!isSmart, filter ?? null);
      return NextResponse.json({ success: true, id });
    }

    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Request failed' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, collectionId, name, filter, color } = body;

    if (!collectionId) {
      return NextResponse.json({ error: 'collectionId is required' }, { status: 400 });
    }

    if (action === 'rename' && typeof name === 'string' && name.trim()) {
      renameCollection(collectionId, name.trim());
      return NextResponse.json({ success: true });
    }

    if (action === 'update-color' && (color === null || (typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color)))) {
      updateCollectionColor(collectionId, color);
      return NextResponse.json({ success: true });
    }

    if (action === 'update-filter' && typeof filter === 'string') {
      updateCollectionFilter(collectionId, filter);
      return NextResponse.json({ success: true });
    }

    if (action === 'convert-to-regular') {
      convertToRegularCollection(collectionId);
      return NextResponse.json({ success: true });
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
