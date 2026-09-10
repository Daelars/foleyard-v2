"use client";

import { Monitor } from "lucide-react";

import { Button, Slider, TagChip } from "@/components/variant-i";

import type { AppearanceTabProps } from "@/components/settings/types";

export function V3SettingsAppearanceTab({ zoom = 100, onUpdateZoom }: AppearanceTabProps) {
  const handleSliderChange = (value: number) => {
    onUpdateZoom?.(value);
  };

  const handleResetZoom = () => {
    onUpdateZoom?.(100);
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-8">
      <div>
        <h3 className="text-2xl font-bold tracking-tight text-zinc-50">Appearance</h3>
        <p className="mt-1 text-[13px] text-zinc-500">
          Customize how Foleyard looks on your display.
        </p>
      </div>

      <section className="space-y-6 rounded-xl border border-[var(--vi-edge)] bg-white/[0.02] p-6">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Monitor className="size-4 text-accent-text" />
              <span className="text-sm font-medium text-zinc-200">Interface zoom</span>
            </div>
            <p className="text-xs text-zinc-500">
              Scale the entire UI. Useful for high-DPI screens.
            </p>
          </div>
          <TagChip>{zoom}%</TagChip>
        </div>

        <div className="space-y-4">
          <Slider
            label="Interface zoom"
            value={zoom}
            min={50}
            max={200}
            step={5}
            onChange={handleSliderChange}
            formatValue={(value) => `${value}%`}
          />
          <div className="flex justify-between font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-600">
            <span>50%</span>
            <span>100%</span>
            <span>200%</span>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <Button
            tone="secondary"
            size="sm"
            onClick={handleResetZoom}
            disabled={zoom === 100}
            className="font-mono text-[10px] uppercase tracking-widest"
          >
            Reset to Default
          </Button>
        </div>
      </section>
    </div>
  );
}