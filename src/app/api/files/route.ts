import { errorResponse } from "@/lib/api/errors";
import { readMutationBody } from "@/lib/api/body";
import { mutationError } from "@/lib/api/errors";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, parsePageInteger } from "@/lib/api/pagination";
import { NextRequest, NextResponse } from 'next/server';
import { deleteFiles } from '@/lib/files/delete-files';
import { attachTagToFile, detachTagFromFile, getFileCount, getFiles, getTagsForFiles, toggleFavorite } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
    return errorResponse(`limit must be an integer from 1 to ${MAX_PAGE_SIZE}; offset must be a non-negative integer`, 400);
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
    const body = await readMutationBody(request);
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

    return errorResponse('Unknown action', 400);
  } catch (error) {
    return mutationError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await readMutationBody(request, false);
    const { fileIds, permanent } = body;

    if (
      !Array.isArray(fileIds) ||
      fileIds.some((id) => typeof id !== 'string')
    ) {
      return errorResponse('fileIds must be string[]', 400);
    }

    const { removed, failed } = await deleteFiles(fileIds, permanent === true);

    return NextResponse.json({ removed, failed });
  } catch (error) {
    return mutationError(error);
  }
}
