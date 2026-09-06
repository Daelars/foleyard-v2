"use client";

import type { CSSProperties } from "react";
import "@/components/dotmatrix-loader.css";
import { cx, type DotMatrixCommonProps, type DotMatrixPhase, type DotAnimationResolver } from "./types";
import { getPatternIndexes } from "./patterns";
import { MATRIX_SIZE, indexToCoord, distanceFromCenter, polarAngle, normalizedRadius, manhattanDistance } from "./geometry";
import { getMatrix5Layout, resolveDmxBoxOuterDim, clamp01Dmx, remapOpacityToTriplet } from "./animation-math";

interface DotMatrixBaseProps extends DotMatrixCommonProps {
  phase: DotMatrixPhase;
  reducedMotion?: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  animationResolver?: DotAnimationResolver;
}

export function DotMatrixBase({
  size = 24,
  dotSize = 3,
  color = "currentColor",
  speed = 1,
  ariaLabel = "Loading",
  className,
  pattern = "diamond",
  muted = false,
  dotClassName,
  phase,
  reducedMotion = false,
  onMouseEnter,
  onMouseLeave,
  animationResolver,
  opacityBase,
  opacityMid,
  opacityPeak,
  cellPadding,
  boxSize,
  minSize
}: DotMatrixBaseProps) {
  const patternIndexes = new Set(getPatternIndexes(pattern));
  const safeSpeed = speed > 0 ? speed : 1;
  const speedScale = 1 / safeSpeed;
  const { gap, matrixSpan } = getMatrix5Layout(size, dotSize, cellPadding);
  const { outerDim, useWrapper } = resolveDmxBoxOuterDim({ boxSize, minSize });
  const scale = useWrapper && matrixSpan > 0 ? outerDim / matrixSpan : 1;
  const center = Math.floor(MATRIX_SIZE / 2);
  const ob = clamp01Dmx(opacityBase);
  const om = clamp01Dmx(opacityMid);
  const op = clamp01Dmx(opacityPeak);
  const unit = dotSize + gap;

  const dmxVarStyle = {
    width: matrixSpan,
    height: matrixSpan,
    "--dmx-speed": speedScale,
    color,
    ...(ob !== undefined && { ["--dmx-opacity-base" as const]: ob }),
    ...(om !== undefined && { ["--dmx-opacity-mid" as const]: om }),
    ...(op !== undefined && { ["--dmx-opacity-peak" as const]: op }),
    ...(useWrapper
      ? {
          transform: `scale(${scale})`,
          transformOrigin: "center center" as const
        }
      : { minWidth: minSize, minHeight: minSize })
  };

  const dots = Array.from({ length: MATRIX_SIZE * MATRIX_SIZE }).map((_, index) => {
    const { row, col } = indexToCoord(index);
    const isActive = patternIndexes.has(index);
    const distance = distanceFromCenter(index);
    const angle = polarAngle(index);
    const radiusNormalizedValue = normalizedRadius(index);
    const manhattan = manhattanDistance(index);
    const deltaX = (col - center) * unit;
    const deltaY = (row - center) * unit;

    const animationState = animationResolver
      ? animationResolver({
          index,
          row,
          col,
          distanceFromCenter: distance,
          angleFromCenter: angle,
          radiusNormalized: radiusNormalizedValue,
          manhattanDistance: manhattan,
          phase,
          isActive,
          reducedMotion
        })
      : {};

    const resolvedAnimationStyle = animationState.style ? { ...animationState.style } : undefined;
    const rawOpacity = resolvedAnimationStyle?.opacity;
    if (resolvedAnimationStyle != null && typeof rawOpacity === "number") {
      resolvedAnimationStyle.opacity = remapOpacityToTriplet(rawOpacity, ob, om, op);
    }

    const dotStyle = {
      width: dotSize,
      height: dotSize,
      "--dmx-distance": distance,
      "--dmx-row": row,
      "--dmx-col": col,
      "--dmx-x": `${deltaX}px`,
      "--dmx-y": `${deltaY}px`,
      "--dmx-angle": angle,
      "--dmx-radius": radiusNormalizedValue,
      "--dmx-manhattan": manhattan,
      ...resolvedAnimationStyle,
      ...(!isActive
        ? {
            opacity: 0,
            visibility: "hidden" as const,
            pointerEvents: "none" as const,
            animation: "none"
          }
        : {})
    } as CSSProperties;

    return (
      <span
        key={index}
        aria-hidden="true"
        className={cx("dmx-dot", !isActive && "dmx-inactive", dotClassName, animationState.className)}
        style={dotStyle}
      />
    );
  });

  const matrix = (
    <div className={cx("dmx-root", muted && "dmx-muted", !useWrapper && className)} style={dmxVarStyle}>
      <div className="dmx-grid" style={{ gap }}>{dots}</div>
    </div>
  );

  if (useWrapper) {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-label={ariaLabel}
        className={className}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: outerDim,
          height: outerDim,
          minWidth: minSize,
          minHeight: minSize,
          overflow: "hidden"
        }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        {matrix}
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={ariaLabel}
      className={cx("dmx-root", muted && "dmx-muted", className)}
      style={dmxVarStyle}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="dmx-grid" style={{ gap }}>{dots}</div>
    </div>
  );
}
