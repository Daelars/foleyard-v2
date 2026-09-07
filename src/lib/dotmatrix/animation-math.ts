import { MATRIX_SIZE } from "./geometry";

const SOURCE_BASE_OPACITY = 0.08;
const SOURCE_MID_OPACITY = 0.34;
const SOURCE_PEAK_OPACITY = 0.94;

function lerpDmx(start: number, end: number, progress: number): number {
  return start + (end - start) * progress;
}

function normalizeProgressDmx(value: number, start: number, end: number): number {
  const span = end - start;
  if (Math.abs(span) < Number.EPSILON) {
    return 0;
  }
  return Math.min(1, Math.max(0, (value - start) / span));
}

function coerceOpacityDmx(value: number | undefined): number | undefined {
  if (value == null || !Number.isFinite(value)) {
    return undefined;
  }
  return Math.min(1, Math.max(0, value));
}

export function remapOpacityToTriplet(
  opacity: number,
  opacityBase: number | undefined,
  opacityMid: number | undefined,
  opacityPeak: number | undefined
): number {
  if (!Number.isFinite(opacity)) {
    return opacity;
  }

  const hasOverrides = opacityBase !== undefined || opacityMid !== undefined || opacityPeak !== undefined;
  const safeOpacity = Math.min(1, Math.max(0, opacity));
  if (!hasOverrides) {
    return safeOpacity;
  }

  const targetBase = coerceOpacityDmx(opacityBase) ?? SOURCE_BASE_OPACITY;
  const targetMid = coerceOpacityDmx(opacityMid) ?? SOURCE_MID_OPACITY;
  const targetPeak = coerceOpacityDmx(opacityPeak) ?? SOURCE_PEAK_OPACITY;

  if (safeOpacity <= SOURCE_BASE_OPACITY) {
    const progress = normalizeProgressDmx(safeOpacity, 0, SOURCE_BASE_OPACITY);
    return Math.min(1, Math.max(0, lerpDmx(0, targetBase, progress)));
  }

  if (safeOpacity <= SOURCE_MID_OPACITY) {
    const progress = normalizeProgressDmx(safeOpacity, SOURCE_BASE_OPACITY, SOURCE_MID_OPACITY);
    return Math.min(1, Math.max(0, lerpDmx(targetBase, targetMid, progress)));
  }

  if (safeOpacity <= SOURCE_PEAK_OPACITY) {
    const progress = normalizeProgressDmx(safeOpacity, SOURCE_MID_OPACITY, SOURCE_PEAK_OPACITY);
    return Math.min(1, Math.max(0, lerpDmx(targetMid, targetPeak, progress)));
  }

  const progress = normalizeProgressDmx(safeOpacity, SOURCE_PEAK_OPACITY, 1);
  return Math.min(1, Math.max(0, lerpDmx(targetPeak, 1, progress)));
}

export function getMatrix5Layout(
  size: number,
  dotSize: number,
  cellPadding?: number
): { gap: number; matrixSpan: number } {
  const n = MATRIX_SIZE;
  if (cellPadding != null) {
    const g = Math.max(0, cellPadding);
    const matrixSpan = dotSize * n + g * (n - 1);
    return { gap: g, matrixSpan };
  }
  const g = Math.max(1, Math.floor((size - dotSize * n) / (n - 1)));
  return { gap: g, matrixSpan: size };
}

export function resolveDmxBoxOuterDim(
  options: { boxSize?: number; minSize?: number } | null | undefined
): { outerDim: number; useWrapper: boolean } {
  const b = options?.boxSize;
  const hasBox = b != null && b > 0 && Number.isFinite(b);
  if (!hasBox) {
    return { outerDim: 0, useWrapper: false };
  }
  const m = options?.minSize;
  if (m != null && m > 0 && Number.isFinite(m)) {
    return { outerDim: Math.max(b, m), useWrapper: true };
  }
  return { outerDim: b, useWrapper: true };
}

export function clamp01Dmx(n: number | undefined) {
  if (n == null) {
    return;
  }
  if (!Number.isFinite(n)) {
    return;
  }
  return Math.min(1, Math.max(0, n));
}
