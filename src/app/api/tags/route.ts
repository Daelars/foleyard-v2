import { errorResponse } from "@/lib/api/errors";
import { readMutationBody } from "@/lib/api/body";
import { mutationError } from "@/lib/api/errors";
import { NextRequest, NextResponse } from 'next/server';
import { attachTagToFile, createTag, deleteTag, detachTagFromFile, getAllTags, getTagsForFile, renameTag, updateTagColor } from '@/lib/db';

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
    const body = await readMutationBody(request);
    const { name, fileId, tagId } = body;

    if (fileId && tagId) {
      attachTagToFile(fileId, tagId);
      return NextResponse.json({ success: true });
    }

    if (name) {
      const id = createTag(name.trim());
      return NextResponse.json({ success: true, id });
    }

    return errorResponse('Invalid request', 400);
  } catch (error) {
    return mutationError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await readMutationBody(request);
    const { fileId, tagId } = body;

    if (fileId && tagId) {
      detachTagFromFile(fileId, tagId);
      return NextResponse.json({ success: true });
    }

    if (tagId) {
      deleteTag(tagId);
      return NextResponse.json({ success: true });
    }

    return errorResponse('Invalid request', 400);
  } catch (error) {
    return mutationError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await readMutationBody(request);
    const { tagId, color, name } = body;

    if (typeof tagId !== 'string' || !tagId) {
      return errorResponse('tagId is required', 400);
    }

    if (typeof name === 'string' && name.trim()) {
      renameTag(tagId, name.trim());
      return NextResponse.json({ success: true });
    }

    if (color !== null && (typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color))) {
      return errorResponse('color must be a #rrggbb hex string or null', 400);
    }

    updateTagColor(tagId, color);
    return NextResponse.json({ success: true });
  } catch (error) {
    return mutationError(error);
  }
}
