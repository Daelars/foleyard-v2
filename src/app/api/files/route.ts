import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import { attachTagToFile, detachTagFromFile, getFileById, getFiles, getTagsForFiles, markFileRemoved, toggleFavorite } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
  const favorites = searchParams.get('favorites');
  const collectionId = searchParams.get('collectionId');
  const directory = searchParams.get('directory');
  const showRemoved = searchParams.get('showRemoved') === 'true';
  const limit = parseInt(searchParams.get('limit') ?? '500', 10);
  const offset = parseInt(searchParams.get('offset') ?? '0', 10);

  const files = getFiles({
    query: query ?? undefined,
    favorites: favorites === 'true',
    collectionId,
    directory,
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

  return NextResponse.json({ files: filesWithTags, limit, offset });
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

    const removed: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];
    const now = new Date().toISOString();

    for (const id of fileIds as string[]) {
      const record = getFileById(id);

      if (!record) {
        failed.push({ id, error: 'Not found' });
        continue;
      }

      if (permanent === true) {
        try {
          fs.unlinkSync(record.path);
        } catch (error) {
          if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
            failed.push({
              id,
              error: error instanceof Error ? error.message : 'Delete failed',
            });
            continue;
          }
        }
      }

      markFileRemoved(record.path, now);
      removed.push(id);
    }

    return NextResponse.json({ removed, failed });
  } catch {
    return NextResponse.json({ error: 'Request failed' }, { status: 500 });
  }
}
