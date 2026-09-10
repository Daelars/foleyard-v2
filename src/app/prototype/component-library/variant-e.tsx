// PROTOTYPE ONLY — variant E, "House style".
//
// Layout is B's spec sheet (label gutter + benches), kept deliberately: the
// question here is the elements, not the page. What changed from B is every
// control inside it, rebuilt in the language the app already speaks — see
// ./variant-e-kit for where each value comes from.
"use client";

import { useEffect, useRef, useState } from "react";
import {
  Activity,
  AudioLines,
  Command,
  Download,
  FileMusic,
  Library,
  Play,
  Sparkles,
} from "lucide-react";
import type { PaletteSection as PaletteSectionName } from "@/components/CommandPalette/command-palette";

import { SPECIMEN_COMMANDS, SPECIMEN_FILES, SPECIMEN_SETTINGS } from "./fixtures";
import type { SpecimenState } from "./page";
import {
  Action,
  ActionKeyframes,
  Field,
  MetaLine,
  PaletteFooter,
  PaletteHeader,
  PalettePanel,
  PaletteRow,
  PaletteSection,
  SearchField,
  Segmented,
  SettingRow,
  TagChip,
  Toggle,
} from "./variant-e-kit";

const SECTION_ICONS: Record<PaletteSectionName, React.ReactNode> = {
  view: <Library />,
  transport: <Play />,
  sound: <AudioLines />,
  tool: <Sparkles />,
  file: <FileMusic />,
};

const ORIGIN_OPTIONS = [
  { value: null, label: "All" },
  { value: "manual", label: "Manual" },
  { value: "deterministic", label: "Rules" },
  { value: "semantic_ai", label: "AI" },
] as const;

function Bench({
  label,
  note,
  children,
}: {
  label: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-4 border-t border-white/10 py-7 md:grid-cols-[10rem_1fr] md:gap-8">
      <div className="md:pt-1">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">{label}</p>
        {note ? <p className="mt-2 text-[12px] leading-[1.5] text-zinc-600">{note}</p> : null}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

export function VariantE({ settings, onToggleSetting, scanRunning, onToggleScan }: SpecimenState) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [origin, setOrigin] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState(0);
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
    <div className="min-h-full bg-canvas">
      <ActionKeyframes />
      <div className="mx-auto max-w-5xl px-6 py-10">
        <header className="flex flex-wrap items-end justify-between gap-4 pb-7">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-accent-text">
              Foleyard / development
            </p>
            <h1 className="mt-2 text-[28px] font-semibold leading-tight tracking-tight text-zinc-50">
              Component library
            </h1>
            <p className="mt-2 max-w-lg text-[13px] leading-[1.6] text-zinc-500">
              Variant E — B&rsquo;s layout, rebuilt elements. Nothing here is a new visual idea:
              the radius, wash, glow and type all already exist in the rail, the search bar and
              the file row.
            </p>
          </div>
          <Action tone="secondary" onClick={openPalette}>
            <Command />
            Open command palette
          </Action>
        </header>

        <Bench
          label="Surfaces"
          note="Three levels, all already on screen elsewhere in the app."
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-white/5 px-3.5 py-4">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
                Control
              </p>
              <p className="mt-1.5 text-[12px] leading-[1.5] text-zinc-500">
                white/5 over white/10. The search bar and rail hover state.
              </p>
            </div>
            <div className="rounded-xl border border-accent-fill/50 bg-accent-fill/15 px-3.5 py-4 shadow-glow-accent">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-accent-text">
                Active
              </p>
              <p className="mt-1.5 text-[12px] leading-[1.5] text-zinc-400">
                accent/15 on accent/50, with glow. The active rail item.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-shell/95 px-3.5 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_12px_28px_rgba(0,0,0,0.5)]">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
                Panel
              </p>
              <p className="mt-1.5 text-[12px] leading-[1.5] text-zinc-500">
                Floats above the workspace. Radius steps up to 16.
              </p>
            </div>
          </div>
        </Bench>

        <Bench
          label="Actions"
          note="Primary is the active rail item's treatment, which is why it already felt at home."
        >
          <div className="flex flex-wrap items-center gap-2">
            <Action tone="primary">
              <AudioLines />
              Analyze with CLAP
            </Action>
            <Action tone="secondary">
              <Sparkles />
              Tag with filename rules
            </Action>
            <Action tone="ghost">
              <Download />
              Download model
            </Action>
            <Action tone="ghost" size="icon" aria-label="More auto-tag actions">
              <span className="text-base leading-none">···</span>
            </Action>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Action size="sm" tone="primary">
              Small primary
            </Action>
            <Action size="sm" tone="secondary">
              Small secondary
            </Action>
            <Action size="sm" tone="danger">
              Remove root
            </Action>
            <Action size="sm" disabled>
              Unavailable
            </Action>
            <Action size="sm" pending>
              Downloading model
            </Action>
          </div>
          <p className="mt-3 text-[12px] text-zinc-600">
            Compact is 32px with a 12.5px label, never dimmer than zinc-200 — B&rsquo;s 24px
            zinc-400 buttons were the unreadable ones.
          </p>
        </Bench>

        <Bench
          label="Tags"
          note="The library has never used pills — file rows print tags as a mono metadata line."
        >
          <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
            {SPECIMEN_FILES.map((file, index) => (
              <div
                key={file.filename}
                role="row"
                tabIndex={0}
                onClick={() => setSelectedFile(index)}
                onKeyDown={(event) => event.key === "Enter" && setSelectedFile(index)}
                className={`relative flex h-16 w-full cursor-pointer items-center gap-3 border-b border-white/5 px-3 outline-none transition-colors last:border-0 ${
                  selectedFile === index ? "bg-accent-fill/10" : "hover:bg-white/[0.04]"
                }`}
              >
                {selectedFile === index ? (
                  <span className="pointer-events-none absolute inset-y-2 left-0 w-[3px] rounded-full bg-accent-fill shadow-glow-accent" />
                ) : null}
                <span
                  className={`flex w-7 justify-center ${
                    selectedFile === index ? "text-accent-text" : "text-zinc-500"
                  }`}
                >
                  <Play className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={`block truncate text-[15px] ${
                      selectedFile === index
                        ? "font-semibold text-zinc-50"
                        : "font-medium text-zinc-100"
                    }`}
                  >
                    {file.filename}
                  </span>
                  <MetaLine format="wav" tags={file.tags} className="mt-0.5" />
                </span>
                <span className="shrink-0 font-mono text-xs font-medium tabular-nums text-zinc-300">
                  0:04
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[12px] text-zinc-600">
            Chips are only for the board and organize surfaces, where a tag is picked rather than
            read:
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <TagChip name="thunder" onClick={() => {}} />
            <TagChip name="weather" selected onClick={() => {}} />
            <TagChip name="impact" provenance="semantic_ai" confidence={0.92} onClick={() => {}} />
            <TagChip name="foley" provenance="manual" onClick={() => {}} />
            <span className="ml-2">
              <Segmented
                label="Filter by tag origin"
                options={ORIGIN_OPTIONS}
                value={origin}
                onChange={setOrigin}
              />
            </span>
          </div>
        </Bench>

        <Bench label="Settings" note="Row rhythm and label scale taken from the 64px file row.">
          <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
            <SettingRow
              label="Start Full Scan"
              description={
                scanRunning
                  ? "Scanning library · indexing metadata · 1,204 of 8,900 files"
                  : "Refresh metadata and discover new sounds under your scan roots."
              }
            >
              <Action
                size="sm"
                tone={scanRunning ? "secondary" : "primary"}
                pending={scanRunning}
                onClick={onToggleScan}
              >
                <Activity />
                {scanRunning ? "Scanning library" : "Start Full Scan"}
              </Action>
            </SettingRow>
            {SPECIMEN_SETTINGS.map((setting) => (
              <SettingRow
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
              </SettingRow>
            ))}
          </div>
        </Bench>

        <Bench label="Entry" note="Same material and focus glow as the app's search bar.">
          <div className="grid max-w-lg gap-2">
            <SearchField label="Search sounds" placeholder="Search sounds by name, tag, or format..." />
            <Field defaultValue="C:/Sound Library/SFX" aria-label="Scan root" />
            <Field placeholder="Path does not exist" aria-invalid="true" aria-label="Invalid" />
            <Field
              placeholder="Unavailable until the model downloads"
              disabled
              aria-label="Disabled"
            />
          </div>
        </Bench>

        <Bench
          label="Overlay"
          note="Arrow keys move, Enter runs, Escape restores focus to where you were."
        >
          <Action tone="primary" onClick={openPalette}>
            <Command />
            Open command palette
          </Action>
        </Bench>
      </div>

      {paletteOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-4 pt-[12vh] backdrop-blur-sm"
          onClick={closePalette}
        >
          <PalettePanel
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            className="w-full max-w-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <PaletteHeader
              inputRef={inputRef}
              value={query}
              onChange={(value) => {
                setQuery(value);
                setActive(0);
              }}
              role="combobox"
              aria-expanded
              aria-controls="variant-e-palette-list"
              aria-activedescendant={
                filtered.length > 0 ? `variant-e-entry-${activeIndex}` : undefined
              }
            />

            <div
              ref={listRef}
              id="variant-e-palette-list"
              role="listbox"
              aria-label="Commands"
              className="max-h-[340px] overflow-y-auto pb-2"
            >
              {filtered.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-zinc-500">
                  No commands match “{query}”.
                </p>
              ) : (
                filtered.map((entry, index) => {
                  const newSection = index === 0 || filtered[index - 1].section !== entry.section;
                  return (
                    <div key={entry.id}>
                      {newSection ? <PaletteSection>{entry.section}</PaletteSection> : null}
                      <PaletteRow
                        id={`variant-e-entry-${index}`}
                        data-index={index}
                        role="option"
                        aria-selected={index === activeIndex}
                        active={index === activeIndex}
                        icon={SECTION_ICONS[entry.section]}
                        onMouseEnter={() => setActive(index)}
                        onClick={closePalette}
                      >
                        {entry.label}
                      </PaletteRow>
                    </div>
                  );
                })
              )}
            </div>

            <PaletteFooter count={filtered.length} />
          </PalettePanel>
        </div>
      ) : null}
    </div>
  );
}
