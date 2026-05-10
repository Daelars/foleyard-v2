import { NextRequest, NextResponse } from 'next/server';
import { getSubdirectories, getUniqueDirectories } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const all = searchParams.get('all');
  const parent = searchParams.get('parent');

  const directories = all === 'true'
    ? getUniqueDirectories()
    : getSubdirectories(parent);

  return NextResponse.json({ directories });
}
