// PROTOTYPE ONLY — variant A, "Shipped": the current shared components as
// they stand in `src/components/ui`. This is the incumbent, kept here so B
// has something honest to be compared against. Card grid, filled coral
// primary, pill switch, ringed palette rows.
"use client";

import { useEffect, useRef, useState } from "react";
import { Activity, AudioLines, Command, Download, Play, Search, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SettingRow, SoundTag, StatusBadge } from "@/components/ui/foleyard";
import { CommandPalette } from "@/components/CommandPalette/CommandPalette";

import { SPECIMEN_COMMANDS, SPECIMEN_FILES, SPECIMEN_SETTINGS } from "./fixtures";
import type { SpecimenState } from "./page";

export function VariantA({ settings, onToggleSetting, scanRunning, onToggleScan }: SpecimenState) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = SPECIMEN_COMMANDS.filter((command) =>
    command.label.toLowerCase().includes(query.toLowerCase()),
  );

  const openPalette = () => {
    setPaletteOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  useEffect(() => {
    if (!paletteOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPaletteOpen(false);
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActive((index) => Math.min(index + 1, filtered.length - 1));
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActive((index) => Math.max(index - 1, 0));
      }
      if (event.key === "Enter" && filtered[active]) setPaletteOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, filtered, paletteOpen]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent-text">
            Foleyard / development
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Component library</h1>
          <p className="mt-2 max-w-xl text-sm text-zinc-500">
            Variant A — the shared components as shipped. Shadcn geometry with Foleyard colours.
          </p>
        </div>
        <Button variant="outline" onClick={openPalette}>
          <Command data-icon="inline-start" />
          Open command palette
        </Button>
      </header>

      <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <Card className="border-white/10 bg-white/[0.025] p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                Auto tag actions
              </p>
              <h2 className="mt-1 text-lg font-medium">Ready to organize</h2>
            </div>
            <StatusBadge status="model ready" tone="ready" />
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary">
              <Sparkles data-icon="inline-start" />
              Filename rules
            </Button>
            <Button size="sm">
              <AudioLines data-icon="inline-start" />
              Analyze with CLAP
            </Button>
            <Button size="icon-sm" variant="ghost" aria-label="Download model">
              <Download />
            </Button>
          </div>
        </Card>

        <Card className="border-white/10 bg-white/[0.025] p-5">
          <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
            State matrix
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <StatusBadge status="ready" tone="ready" />
            <StatusBadge status="processing" tone="warning" />
            <StatusBadge status="unavailable" />
            <StatusBadge status="error" tone="error" />
            <Button size="sm" disabled>
              Unavailable action
            </Button>
          </div>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="border-white/10 bg-white/[0.025] p-5">
          <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
            Sound file rows
          </p>
          <div className="mt-4 flex flex-col gap-2">
            {SPECIMEN_FILES.map((file) => (
              <div
                key={file.filename}
                className="flex items-center gap-3 rounded-lg border border-white/10 bg-black/20 p-3"
              >
                <Button size="icon-sm" variant="secondary" aria-label={`Play ${file.filename}`}>
                  <Play />
                </Button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{file.filename}</p>
                  <p className="mt-1 font-mono text-[11px] text-zinc-500">{file.meta}</p>
                </div>
                <div className="flex flex-wrap justify-end gap-1">
                  {file.tags.map((tag) => (
                    <SoundTag
                      key={tag.name}
                      name={tag.name}
                      selected={file.current === tag.name}
                      provenance={tag.provenance}
                      confidence={tag.confidence}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <Card className="border-white/10 bg-white/[0.025] p-1">
            <SettingRow
              label="Start Full Scan"
              description={
                scanRunning
                  ? "Scanning library · indexing metadata"
                  : "Refresh metadata and discover new sounds."
              }
            >
              <Button
                size="sm"
                variant={scanRunning ? "outline" : "default"}
                onClick={onToggleScan}
              >
                <Activity data-icon="inline-start" />
                {scanRunning ? "Scanning…" : "Start Full Scan"}
              </Button>
            </SettingRow>
            {SPECIMEN_SETTINGS.map((setting) => (
              <SettingRow
                key={setting.key}
                label={setting.label}
                description={setting.description}
                checked={settings[setting.key]}
                onCheckedChange={() => onToggleSetting(setting.key)}
                disabled={setting.disabled}
              />
            ))}
          </Card>

          <Card className="border-white/10 bg-white/[0.025] p-5">
            <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
              Search treatment
            </p>
            <div className="relative mt-4">
              <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-zinc-500" />
              <Input className="pl-9" placeholder="Search your library" />
              <Input className="mt-2" placeholder="Invalid path" aria-invalid />
              <Input className="mt-2" placeholder="Unavailable" disabled />
            </div>
          </Card>
        </div>
      </section>

      <CommandPalette
        open={paletteOpen}
        query={query}
        entries={filtered}
        activeIndex={Math.min(active, Math.max(0, filtered.length - 1))}
        inputRef={inputRef}
        onQueryChange={(value) => {
          setQuery(value);
          setActive(0);
        }}
        onHoverEntry={setActive}
        onSelectEntry={() => setPaletteOpen(false)}
        onClose={() => setPaletteOpen(false)}
      />
    </div>
  );
}
