import { NextRequest, NextResponse } from 'next/server';
import { getSubdirectories } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const parent = searchParams.get('parent');
  const directories = getSubdirectories(parent);
  return NextResponse.json({ directories });
}
