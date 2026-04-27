import { NextRequest, NextResponse } from 'next/server';
import { getFiles, toggleFavorite } from '@/lib/db';

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

  return NextResponse.json({ files, limit, offset });
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, action } = body;
    
    if (action === 'toggleFavorite') {
      await toggleFavorite(id);
      return NextResponse.json({ success: true });
    }
    
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Request failed' }, { status: 500 });
  }
}
