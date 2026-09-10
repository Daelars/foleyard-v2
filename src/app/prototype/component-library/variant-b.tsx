// PROTOTYPE ONLY — variant B, "Console". Same fixtures as A, different
// controls (./variant-b-kit) and a different specimen layout: a spec sheet
// with a label gutter and full-bleed benches, rather than A's card grid, so
// the controls are judged against each other rather than inside decorated
// boxes.
"use client";

import { useEffect, useRef, useState } from "react";
import { Activity, AudioLines, Command, Download, Play, Search, Sparkles } from "lucide-react";

import { SPECIMEN_COMMANDS, SPECIMEN_FILES, SPECIMEN_SETTINGS } from "./fixtures";
import type { SpecimenState } from "./page";
import {
  Band,
  Chip,
  ConsoleSurface,
  Field,
  Key,
  Panel,
  SectionHeader,
  SettingBand,
  StatusLine,
  Toggle,
} from "./variant-b-kit";

function Bench({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 border-t border-[var(--b-edge)] py-7 md:grid-cols-[10rem_1fr] md:gap-8">
      <div className="md:pt-1">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">{label}</p>
        {note ? <p className="mt-2 text-[11.5px] leading-[1.5] text-zinc-600">{note}</p> : null}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

export function VariantB({ settings, onToggleSetting, scanRunning, onToggleScan }: SpecimenState) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = SPECIMEN_COMMANDS.filter((command) =>
    command.label.toLowerCase().includes(query.toLowerCase()),
  );
  const activeIndex = Math.min(active, Math.max(0, filtered.length - 1));

  const openPalette = () => {
    restoreRef.current = document.activeElement as HTMLElement | null;
    setPaletteOpen(true);
    setQuery("");
    setActive(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const closePalette = () => {
    setPaletteOpen(false);
    restoreRef.current?.focus();
  };

  useEffect(() => {
    if (!paletteOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closePalette();
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActive((index) => Math.min(index + 1, filtered.length - 1));
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActive((index) => Math.max(index - 1, 0));
      }
      if (event.key === "Enter" && filtered[activeIndex]) {
        event.preventDefault();
        closePalette();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  return (
    <ConsoleSurface className="min-h-full bg-canvas">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <header className="flex flex-wrap items-end justify-between gap-4 pb-7">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent-text">
              Foleyard / development
            </p>
            <h1 className="mt-2 text-[28px] font-semibold leading-tight tracking-tight text-zinc-50">
              Component library
            </h1>
            <p className="mt-2 max-w-lg text-[12.5px] leading-[1.6] text-zinc-500">
              Variant B — &ldquo;Console&rdquo;. Every control is either a recessed well or a
              raised key. Coral lights a key; it is never a solid block.
            </p>
          </div>
          <Key tone="neutral" onClick={openPalette}>
            <Command />
            Open command palette
          </Key>
        </header>

        <Bench
          label="Material"
          note="Two levels do all the work. Everything below is built from these."
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-[6px] border border-[var(--b-edge)] bg-[var(--b-well)] px-3 py-4 shadow-[var(--b-sink)]">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">Well</p>
              <p className="mt-1.5 text-[11.5px] leading-[1.45] text-zinc-600">
                Holds or receives. Fields, switch tracks, tag slots.
              </p>
            </div>
            <div className="rounded-[6px] border border-[var(--b-edge)] bg-[var(--b-key)] px-3 py-4 shadow-[var(--b-lift)]">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-400">Key</p>
              <p className="mt-1.5 text-[11.5px] leading-[1.45] text-zinc-500">
                Pressable. Buttons, switch thumbs, shortcut caps.
              </p>
            </div>
            <div className="rounded-[10px] border border-[var(--b-edge-hi)] bg-[var(--b-panel)] px-3 py-4 shadow-[inset_0_1px_0_var(--b-top),0_12px_28px_rgba(0,0,0,0.5)]">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-400">
                Panel
              </p>
              <p className="mt-1.5 text-[11.5px] leading-[1.45] text-zinc-500">
                Floats above the workspace. Radius steps up to 10.
              </p>
            </div>
          </div>
        </Bench>

        <Bench
          label="Actions"
          note="One lit key per context. Press them — the key travels. Disabled sinks into a well instead of fading out."
        >
          <div className="flex flex-wrap items-center gap-2">
            <Key tone="primary">
              <AudioLines />
              Analyze with CLAP
            </Key>
            <Key tone="neutral">
              <Sparkles />
              Tag with filename rules
            </Key>
            <Key tone="quiet">
              <Download />
              Download model
            </Key>
            <Key tone="quiet" size="icon" aria-label="More auto-tag actions">
              <span className="text-[15px] leading-none">···</span>
            </Key>
            <StatusLine status="model ready" tone="ready" />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Key size="sm" tone="primary">
              Small primary
            </Key>
            <Key size="sm" tone="neutral">
              Small neutral
            </Key>
            <Key size="sm" tone="danger">
              Remove root
            </Key>
            <Key size="sm" disabled>
              Unavailable
            </Key>
            <Key size="sm" pending>
              Downloading model
            </Key>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-5">
            <StatusLine status="ready" tone="ready" />
            <StatusLine status="processing" tone="processing" />
            <StatusLine status="not downloaded" tone="unavailable" />
            <StatusLine status="analysis failed" tone="error" />
          </div>
        </Bench>

        <Bench
          label="Tags"
          note="Metadata sits in the surface. The coral rail marks the current tag without outranking its neighbours."
        >
          <div className="overflow-hidden rounded-[6px] border border-[var(--b-edge)] bg-black/20">
            {SPECIMEN_FILES.map((file) => (
              <div
                key={file.filename}
                className="flex items-center gap-3 border-b border-[var(--b-edge)] px-3 py-2.5 last:border-b-0"
              >
                <Key size="icon-sm" tone="neutral" aria-label={`Play ${file.filename}`}>
                  <Play />
                </Key>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-zinc-100">{file.filename}</p>
                  <p className="mt-0.5 font-mono text-[10.5px] text-zinc-600">{file.meta}</p>
                </div>
                <div className="flex max-w-[55%] flex-wrap justify-end gap-1">
                  {file.tags.map((tag) => (
                    <Chip
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
          <p className="mt-3 text-[11.5px] text-zinc-600">
            Interactive tags are the same slot with a hover edge, so a passive tag never looks
            pressable:
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            <Chip name="thunder" onClick={() => {}} />
            <Chip name="weather" selected onClick={() => {}} />
            <Chip name="impact" provenance="semantic_ai" confidence={0.92} onClick={() => {}} />
          </div>
        </Bench>

        <Bench
          label="Settings"
          note="Controls align to the label's first line, not the row's centre."
        >
          <div className="overflow-hidden rounded-[6px] border border-[var(--b-edge)] bg-[var(--b-key)]/40">
            <SettingBand
              label="Start Full Scan"
              description={
                scanRunning
                  ? "Scanning library · indexing metadata · 1,204 of 8,900 files"
                  : "Refresh metadata and discover new sounds under your scan roots."
              }
            >
              <Key
                size="sm"
                tone={scanRunning ? "neutral" : "primary"}
                pending={scanRunning}
                onClick={onToggleScan}
              >
                <Activity />
                {scanRunning ? "Scanning library" : "Start Full Scan"}
              </Key>
            </SettingBand>
            {SPECIMEN_SETTINGS.map((setting) => (
              <SettingBand
                key={setting.key}
                label={setting.label}
                description={setting.description}
              >
                <Toggle
                  label={setting.label}
                  checked={settings[setting.key]}
                  disabled={setting.disabled}
                  onCheckedChange={() => onToggleSetting(setting.key)}
                />
              </SettingBand>
            ))}
          </div>
          <p className="mt-3 text-[11.5px] text-zinc-600">
            Scanning is a running job, so the key stays neutral and shows a live edge — the primary
            slot is not spent on an action you cannot take right now.
          </p>
        </Bench>

        <Bench label="Entry" note="Focus lights a rule under the field instead of a halo.">
          <div className="grid max-w-md gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-[14px] -translate-y-1/2 text-zinc-600" />
              <Field className="pl-8" placeholder="Search sounds by name, tag, or format" />
            </div>
            <Field defaultValue="C:/Sound Library/SFX" />
            <Field placeholder="Path does not exist" aria-invalid="true" />
            <Field placeholder="Unavailable until the model downloads" disabled />
          </div>
        </Bench>

        <Bench
          label="Overlay"
          note="Press the key above, or open it here. Arrow keys move, Enter runs, Escape restores focus to where you were."
        >
          <Key tone="primary" onClick={openPalette}>
            <Command />
            Open command palette
          </Key>
        </Bench>
      </div>

      {paletteOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/55 px-4 pt-[14vh] backdrop-blur-[2px]"
          onClick={closePalette}
        >
          <Panel
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            className="w-full max-w-[560px]"
            onClick={(event) => event.stopPropagation()}
          >
            <div>
              <div className="flex items-center gap-2.5 border-b border-[var(--b-edge)] px-3.5 transition-colors duration-[120ms] focus-within:border-[color-mix(in_oklab,var(--accent-fill)_45%,transparent)]">
                <Search className="size-[15px] shrink-0 text-zinc-600" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setActive(0);
                  }}
                  placeholder="Type a command or sound…"
                  aria-label="Search commands"
                  role="combobox"
                  aria-expanded
                  aria-controls="variant-b-palette-list"
                  aria-activedescendant={
                    filtered.length > 0 ? `variant-b-entry-${activeIndex}` : undefined
                  }
                  className="h-[42px] w-full bg-transparent text-[14px] text-zinc-100 outline-none placeholder:text-zinc-600"
                />
                <kbd className="shrink-0 rounded-[3px] border border-[var(--b-edge-hi)] bg-[var(--b-key)] px-1.5 py-0.5 font-mono text-[10px] text-zinc-500 shadow-[var(--b-lift)]">
                  esc
                </kbd>
              </div>

              <div
                ref={listRef}
                id="variant-b-palette-list"
                role="listbox"
                aria-label="Commands"
                className="max-h-[320px] overflow-y-auto py-1"
              >
                {filtered.length === 0 ? (
                  <p className="px-4 py-6 text-center text-[12.5px] text-zinc-600">
                    No commands match “{query}”.
                  </p>
                ) : (
                  filtered.map((entry, index) => {
                    const newSection = index === 0 || filtered[index - 1].section !== entry.section;
                    return (
                      <div key={entry.id}>
                        {newSection ? <SectionHeader>{entry.section}</SectionHeader> : null}
                        <Band
                          id={`variant-b-entry-${index}`}
                          data-index={index}
                          role="option"
                          aria-selected={index === activeIndex}
                          active={index === activeIndex}
                          hint={entry.hint}
                          onMouseEnter={() => setActive(index)}
                          onClick={closePalette}
                        >
                          {entry.label}
                        </Band>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </Panel>
        </div>
      ) : null}
    </ConsoleSurface>
  );
}
