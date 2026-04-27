import { NextResponse } from 'next/server';

import { getScanStatus, startScan } from '@/lib/scanner';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(getScanStatus());
}

export async function POST() {
  const result = startScan();

  if (!result.started) {
    const statusCode = result.reason === 'missing-root' ? 400 : 409;
    return NextResponse.json({ error: result.reason, status: result.status }, { status: statusCode });
  }

  return NextResponse.json({ success: true, status: result.status }, { status: 202 });
}
