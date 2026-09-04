import { NextRequest, NextResponse } from 'next/server';
import { deleteFiles } from '@/lib/files/delete-files';
import { attachTagToFile, detachTagFromFile, getFileCount, getFiles, getTagsForFiles, toggleFavorite } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_PAGE_SIZE = 500;
const MAX_PAGE_SIZE = 500;

function parsePageInteger(value: string | null, fallback: number, minimum: number, maximum?: number) {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || (maximum !== undefined && parsed > maximum)) {
    return null;
  }
  return parsed;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
  const favorites = searchParams.get('favorites');
  const collectionId = searchParams.get('collectionId');
  const directory = searchParams.get('directory');
  const libraryRoot = searchParams.get('libraryRoot');
  const atLibraryRoot = searchParams.get('atLibraryRoot') === 'true';
  const tagId = searchParams.get('tagId');
  const showRemoved = searchParams.get('showRemoved') === 'true';
  const limit = parsePageInteger(searchParams.get('limit'), DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
  const offset = parsePageInteger(searchParams.get('offset'), 0, 0);

  if (limit === null || offset === null) {
    return NextResponse.json(
      { error: `limit must be an integer from 1 to ${MAX_PAGE_SIZE}; offset must be a non-negative integer` },
      { status: 400 },
    );
  }

  const files = getFiles({
    query: query ?? undefined,
    favorites: favorites === 'true',
    collectionId,
    directory,
    libraryRoot,
    atLibraryRoot,
    tagId,
    showRemoved,
    limit,
    offset,
  });

  const fileIds = files.map((f) => f.id);
  const tagsByFile = getTagsForFiles(fileIds);

  const filesWithTags = files.map((file) => ({
    ...file,
    tags: tagsByFile.get(file.id) ?? [],
  }));

  return NextResponse.json({
    files: filesWithTags,
    limit,
    offset,
    favoritesTotal: getFileCount({ favorites: true }),
    hasMore: files.length === limit,
  });
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, action } = body;

    if (action === 'toggleFavorite') {
      await toggleFavorite(id);
      return NextResponse.json({ success: true });
    }

    if (action === 'attachTag') {
      const { tagId } = body;
      attachTagToFile(id, tagId);
      return NextResponse.json({ success: true });
    }

    if (action === 'detachTag') {
      const { tagId } = body;
      detachTagFromFile(id, tagId);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Request failed' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { fileIds, permanent } = body;

    if (
      !Array.isArray(fileIds) ||
      fileIds.some((id) => typeof id !== 'string')
    ) {
      return NextResponse.json({ error: 'fileIds must be string[]' }, { status: 400 });
    }

    const { removed, failed } = await deleteFiles(fileIds, permanent === true);

    return NextResponse.json({ removed, failed });
  } catch {
    return NextResponse.json({ error: 'Request failed' }, { status: 500 });
  }
}
