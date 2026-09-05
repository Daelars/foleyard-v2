import { errorResponse } from "@/lib/api/errors";
import { NextRequest, NextResponse } from 'next/server';
import path from 'node:path';
import { getLibraryRoots, getSubdirectoriesForRoot } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const parent = searchParams.get('parent');
  const requestedRoot = searchParams.get('root');
  const roots = getLibraryRoots();

  if (requestedRoot && !roots.includes(requestedRoot)) {
    return errorResponse('Unknown Library root', 400);
  }

  if (!requestedRoot && roots.length > 1) {
    return NextResponse.json({
      directories: roots.map((libraryRoot) => ({
        key: JSON.stringify([libraryRoot, null]),
        label: path.basename(libraryRoot) || libraryRoot,
        libraryRoot,
        directory: null,
        absolutePath: libraryRoot,
        isRoot: true,
        showRoot: true,
      })),
    });
  }

  const libraryRoot = requestedRoot ?? roots[0];
  if (!libraryRoot) {
    return NextResponse.json({ directories: [] });
  }

  const directories = getSubdirectoriesForRoot(libraryRoot, parent).map((directory) => ({
    key: JSON.stringify([libraryRoot, directory]),
    label: directory.split('/').pop() || directory,
    libraryRoot,
    directory,
    absolutePath: path.join(libraryRoot, directory),
    isRoot: false,
    showRoot: roots.length > 1,
  }));

  return NextResponse.json({ directories });
}
