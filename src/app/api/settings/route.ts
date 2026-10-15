import { errorResponse } from "@/lib/api/errors";
import { NextRequest, NextResponse } from 'next/server';

import {
  detachLibraryRoot,
  forgetLibraryRoot,
  getLibraryRoot,
  getLibraryRoots,
  getLibraryStats,
  getOnboardingVersion,
  reattachLibraryRoot,
  setOnboardingVersion,
} from '@/lib/db';
import { validateLibraryRoot } from '@/lib/scanner';
import { CURRENT_ONBOARDING_VERSION } from '@/app/library/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    libraryRoot: getLibraryRoot(),
    libraryRoots: getLibraryRoots(),
    stats: getLibraryStats(),
    onboardingVersion: getOnboardingVersion(),
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = body?.action;

    if (action === 'validate') {
      const pathValue = String(body?.path ?? '');
      const result = await validateLibraryRoot(pathValue);
      return NextResponse.json(result, { status: result.valid ? 200 : 400 });
    }

    if (action === 'save') {
      const pathValue = String(body?.path ?? '');
      const validation = await validateLibraryRoot(pathValue);

      if (!validation.valid || !validation.normalizedPath) {
        return NextResponse.json(validation, { status: 400 });
      }

      // Re-adding a root also reattaches any records detached by a previous
      // removal, with their organization data (#271).
      reattachLibraryRoot(validation.normalizedPath);

      return NextResponse.json({
        success: true,
        libraryRoot: getLibraryRoot(),
        libraryRoots: getLibraryRoots(),
        savedPath: validation.normalizedPath,
        stats: getLibraryStats(),
      });
    }

    if (action === 'remove') {
      const pathValue = String(body?.path ?? '');
      // Default removal is soft: the root's files are detached and retained.
      detachLibraryRoot(pathValue);

      return NextResponse.json({
        success: true,
        libraryRoot: getLibraryRoot(),
        libraryRoots: getLibraryRoots(),
        stats: getLibraryStats(),
      });
    }

    if (action === 'forget') {
      const pathValue = String(body?.path ?? '');
      // Explicit destructive alternative: remove the root and delete its
      // files and organization data (#271).
      forgetLibraryRoot(pathValue);

      return NextResponse.json({
        success: true,
        libraryRoot: getLibraryRoot(),
        libraryRoots: getLibraryRoots(),
        stats: getLibraryStats(),
      });
    }

    if (action === 'onboarding_complete') {
      setOnboardingVersion(CURRENT_ONBOARDING_VERSION);

      return NextResponse.json({
        success: true,
        onboardingVersion: getOnboardingVersion(),
      });
    }

    return errorResponse('Unknown action', 400);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Settings request failed', 500);
  }
}
