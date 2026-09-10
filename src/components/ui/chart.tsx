"use client";

import * as React from "react";
import * as RechartsPrimitive from "recharts";

import { cn } from "@/lib/utils";

export type ChartConfig = Record<
  string,
  { label?: React.ReactNode; color?: string }
>;

const ChartContext = React.createContext<{ config: ChartConfig } | null>(null);

function useChart() {
  const value = React.useContext(ChartContext);
  if (!value) throw new Error("useChart must be used within ChartContainer");
  return value;
}

export function ChartContainer({
  id,
  config,
  className,
  children,
}: React.ComponentProps<"div"> & {
  config: ChartConfig;
  children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>["children"];
}) {
  const generated = React.useId().replace(/:/g, "");
  const chartId = `chart-${id ?? generated}`;
  const variables = Object.entries(config)
    .filter(([, item]) => item.color)
    .map(([key, item]) => `--color-${key}:${item.color}`)
    .join(";");
  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-slot="chart"
        data-chart={chartId}
        className={cn(
          "flex aspect-video justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line]:stroke-border/50 [&_.recharts-layer]:outline-hidden [&_.recharts-surface]:outline-hidden",
          className,
        )}
      >
        <style>{`[data-chart=${chartId}]{${variables}}`}</style>
        <RechartsPrimitive.ResponsiveContainer>{children}</RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}

export const ChartTooltip = RechartsPrimitive.Tooltip;

type ChartTooltipContentProps = {
  active?: boolean;
  label?: React.ReactNode;
  payload?: ReadonlyArray<{
    dataKey?: string | number;
    name?: string | number;
    value?: string | number | ReadonlyArray<string | number>;
  }>;
};

export function ChartTooltipContent({
  active,
  payload,
  label,
}: ChartTooltipContentProps) {
  const { config } = useChart();
  if (!active || !payload?.length) return null;
  return (
    <div className="grid min-w-32 gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs text-foreground shadow-xl">
      {label ? <p className="font-medium">{String(label)}</p> : null}
      {payload.map((item, index) => {
        const key = String(item.dataKey ?? item.name ?? "value");
        return (
          <div key={`${key}-${index}`} className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">{config[key]?.label ?? item.name ?? key}</span>
            <span className="font-mono font-medium tabular-nums">{String(item.value ?? "")}</span>
          </div>
        );
      })}
    </div>
  );
}
