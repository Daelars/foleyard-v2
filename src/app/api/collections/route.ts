import { errorResponse } from "@/lib/api/errors";
import { readMutationBody } from "@/lib/api/body";
import { ApiError, mutationError } from "@/lib/api/errors";
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
    const body = await readMutationBody(request);
    const { name, fileId, collectionId, isSmart, filter } = body;

    if (fileId && collectionId) {
      attachFileToCollection(fileId, collectionId);
      return NextResponse.json({ success: true });
    }

    const trimmedName = typeof name === 'string' ? name.trim() : '';

    if (trimmedName) {
      if (getAllCollections().some(collection => collection.name === trimmedName)) throw new ApiError("A collection with that name already exists", 409);
      const id = createCollection(trimmedName, !!isSmart, filter ?? null);
      return NextResponse.json({ success: true, id });
    }

    return errorResponse('Invalid request', 400);
  } catch (error) {
    return mutationError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await readMutationBody(request);
    const { action, collectionId, name, filter, color } = body;

    if (!collectionId) {
      return errorResponse('collectionId is required', 400);
    }

    if (action === 'rename' && typeof name === 'string' && name.trim()) {
      if (getAllCollections().some(collection => collection.id !== collectionId && collection.name === name.trim())) throw new ApiError("A collection with that name already exists", 409);
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

    return errorResponse('Invalid request', 400);
  } catch (error) {
    return mutationError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await readMutationBody(request);
    const { fileId, collectionId } = body;

    if (fileId && collectionId) {
      detachFileFromCollection(fileId, collectionId);
      return NextResponse.json({ success: true });
    }

    if (collectionId) {
      deleteCollection(collectionId);
      return NextResponse.json({ success: true });
    }

    return errorResponse('Invalid request', 400);
  } catch (error) {
    return mutationError(error);
  }
}
