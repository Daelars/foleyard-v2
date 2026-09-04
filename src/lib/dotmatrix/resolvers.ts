import type { CSSProperties } from "react";
import type { DotAnimationContext, DotAnimationResolver } from "./types";

export type NormFn = (ctx: Pick<DotAnimationContext, "row" | "col" | "index">) => number;

export function createPathWaveResolver(getPathNorm: NormFn): DotAnimationResolver {
  return ({ isActive, row, col, index, reducedMotion, phase }) => {
    if (!isActive) {
      return { className: "dmx-inactive" };
    }

    const path = getPathNorm({ row, col, index });
    const style = { "--dmx-path": path } as CSSProperties;

    if (reducedMotion || phase === "idle") {
      return {
        style: {
          ...style,
          opacity: 0.12 + path * 0.72
        }
      };
    }

    return { className: "dmx-path", style };
  };
}

