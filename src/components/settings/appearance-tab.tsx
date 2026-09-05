"use client";

import { Monitor } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { TabsContent } from "@/components/ui/tabs";

import { Slider } from "@/components/ui/slider";

import type { AppearanceTabProps } from "./types";

export function AppearanceTab({ zoom = 100, onUpdateZoom }: AppearanceTabProps) {
  const handleSliderChange = (value: number | readonly number[]) => {
    const nextZoom = Array.isArray(value) ? value[0] : value;
    onUpdateZoom?.(nextZoom);
  };

  const handleResetZoom = () => {
    onUpdateZoom?.(100);
  };

  return (
          <TabsContent value="appearance" className="m-0 flex-1 p-8 outline-none">
            <div className="mx-auto w-full max-w-2xl space-y-8">
              <div>
                <h3 className="text-3xl font-bold tracking-tight text-zinc-50">Appearance</h3>
                <p className="mt-1 text-[13px] text-zinc-500">
                  Customize how Foleyard looks on your display.
                </p>
              </div>

              <section className="space-y-6 rounded-xl border border-white/10 bg-white/[0.02] p-6">
                <div className="flex items-center justify-between">
                   <div className="space-y-1">
                     <div className="flex items-center gap-2">
                       <Monitor className="size-4 text-accent-text" />
                       <span className="text-sm font-medium text-zinc-200">Interface zoom</span>
                     </div>
                     <p className="text-xs text-zinc-500">
                        Scale the entire UI. Useful for high-DPI screens.
                     </p>
                   </div>
                   <Badge variant="secondary" className="rounded-full bg-white/5 font-mono tabular-nums text-zinc-200">{zoom}%</Badge>
                </div>

                <div className="space-y-4">
                  <Slider
                    value={[zoom]}
                    min={50}
                    max={200}
                    step={5}
                    onValueChange={handleSliderChange}
                  />
                  <div className="flex justify-between font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-600">
                    <span>50%</span>
                    <span>100%</span>
                    <span>200%</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleResetZoom}
                    disabled={zoom === 100}
                    className="h-8 rounded-lg border-white/15 bg-white/5 font-mono text-[10px] uppercase tracking-widest text-zinc-200 hover:border-accent-fill/50 hover:text-zinc-100 disabled:opacity-40"
                  >
                    Reset to Default
                  </Button>
                </div>
              </section>
            </div>
          </TabsContent>
  );
}
