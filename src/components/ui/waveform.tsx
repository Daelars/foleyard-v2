"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
} from "react";

import { cn } from "@/lib/utils";

export type WaveformProps = HTMLAttributes<HTMLDivElement> & {
  data?: number[];
  barWidth?: number;
  barHeight?: number;
  barGap?: number;
  barRadius?: number;
  barColor?: string;
  fadeEdges?: boolean;
  fadeWidth?: number;
  height?: string | number;
  active?: boolean;
  onBarClick?: (index: number, value: number) => void;
};

export const Waveform = ({
  data = [],
  barWidth = 4,
  barHeight: baseBarHeight = 4,
  barGap = 2,
  barRadius = 2,
  barColor,
  fadeEdges = true,
  fadeWidth = 24,
  height = 128,
  onBarClick,
  className,
  ...props
}: WaveformProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const heightStyle = typeof height === "number" ? `${height}px` : height;

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const renderWaveform = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);

      const styles = getComputedStyle(canvas);
      const computedBarColor = barColor?.startsWith("var(")
        ? styles.getPropertyValue(barColor.slice(4, -1)).trim()
        : barColor || styles.getPropertyValue("--primary").trim() || "#000";

      const step = barWidth + barGap;
      const barCount = Math.max(1, Math.floor(rect.width / step));
      const centerY = rect.height / 2;

      for (let i = 0; i < barCount; i += 1) {
        const dataIndex = Math.floor((i / barCount) * data.length);
        const value = data[dataIndex] || 0;
        const currentBarHeight = Math.max(baseBarHeight, value * rect.height * 0.8);
        const x = i * step;
        const y = centerY - currentBarHeight / 2;

        ctx.fillStyle = computedBarColor;
        ctx.globalAlpha = 0.3 + value * 0.7;

        if (barRadius > 0) {
          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, currentBarHeight, barRadius);
          ctx.fill();
        } else {
          ctx.fillRect(x, y, barWidth, currentBarHeight);
        }
      }

      if (fadeEdges && fadeWidth > 0 && rect.width > 0) {
        const gradient = ctx.createLinearGradient(0, 0, rect.width, 0);
        const fadePercent = Math.min(0.2, fadeWidth / rect.width);

        gradient.addColorStop(0, "rgba(255,255,255,1)");
        gradient.addColorStop(fadePercent, "rgba(255,255,255,0)");
        gradient.addColorStop(1 - fadePercent, "rgba(255,255,255,0)");
        gradient.addColorStop(1, "rgba(255,255,255,1)");

        ctx.globalCompositeOperation = "destination-out";
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, rect.width, rect.height);
        ctx.globalCompositeOperation = "source-over";
      }

      ctx.globalAlpha = 1;
    };

    const resizeObserver = new ResizeObserver(() => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      renderWaveform();
    });

    resizeObserver.observe(container);
    renderWaveform();

    return () => resizeObserver.disconnect();
  }, [data, barWidth, baseBarHeight, barGap, barRadius, barColor, fadeEdges, fadeWidth]);

  const handleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onBarClick) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const barIndex = Math.floor((event.clientX - rect.left) / (barWidth + barGap));
    const dataIndex = Math.floor(
      (barIndex * data.length) / Math.max(1, Math.floor(rect.width / (barWidth + barGap))),
    );

    if (dataIndex >= 0 && dataIndex < data.length) {
      onBarClick(dataIndex, data[dataIndex]);
    }
  };

  return (
    <div
      className={cn("relative", className)}
      ref={containerRef}
      style={{ height: heightStyle }}
      {...props}
    >
      <canvas className="block h-full w-full" onClick={handleClick} ref={canvasRef} />
    </div>
  );
};

export type AudioScrubberProps = WaveformProps & {
  currentTime?: number;
  duration?: number;
  onSeek?: (time: number) => void;
  showHandle?: boolean;
};

function createStaticFallbackWaveform(length: number) {
  return Array.from({ length }, (_, index) => {
    const x = Math.sin(42 + index) * 10000;
    const noise = x - Math.floor(x);
    return 0.2 + noise * 0.6;
  });
}

export const AudioScrubber = ({
  data = [],
  currentTime = 0,
  duration = 100,
  onSeek,
  showHandle = true,
  barWidth = 3,
  barHeight,
  barGap = 1,
  barRadius = 1,
  barColor,
  height = 128,
  className,
  ...props
}: AudioScrubberProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragProgress, setDragProgress] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const waveformData = useMemo(() => {
    return data.length > 0 ? data : createStaticFallbackWaveform(100);
  }, [data]);

  const progress = useMemo(() => {
    if (isDragging && dragProgress !== null) {
      return dragProgress;
    }

    if (duration <= 0) {
      return 0;
    }

    return currentTime / duration;
  }, [currentTime, dragProgress, duration, isDragging]);

  const handleScrub = useCallback(
    (clientX: number) => {
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
      const nextProgress = rect.width > 0 ? x / rect.width : 0;
      const nextTime = nextProgress * duration;

      setDragProgress(nextProgress);
      onSeek?.(nextTime);
    },
    [duration, onSeek],
  );

  const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(true);
    handleScrub(event.clientX);
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (event: MouseEvent) => {
      handleScrub(event.clientX);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setDragProgress(null);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleScrub, isDragging]);

  const heightStyle = typeof height === "number" ? `${height}px` : height;

  return (
    <div
      aria-label="Audio waveform scrubber"
      aria-valuemax={duration}
      aria-valuemin={0}
      aria-valuenow={currentTime}
      className={cn("relative cursor-pointer select-none", className)}
      onMouseDown={handleMouseDown}
      ref={containerRef}
      role="slider"
      style={{ height: heightStyle }}
      tabIndex={0}
      {...props}
    >
      <Waveform
        barColor={barColor}
        barGap={barGap}
        barRadius={barRadius}
        barWidth={barWidth}
        barHeight={barHeight}
        data={waveformData}
        fadeEdges={false}
        height="100%"
        className="h-full w-full"
      />

      <div
        className="pointer-events-none absolute inset-y-0 left-0 bg-primary/20"
        style={{ width: `${progress * 100}%` }}
      />

      <div
        className="pointer-events-none absolute bottom-0 top-0 w-0.5 bg-primary"
        style={{ left: `${progress * 100}%` }}
      />

      {showHandle ? (
        <div
          className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-primary shadow-lg"
          style={{ left: `${progress * 100}%` }}
        />
      ) : null}
    </div>
  );
};
