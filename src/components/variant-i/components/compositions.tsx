"use client";

import type { ReactNode } from "react";
import {
  AlertCircle,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileUp,
  Folder,
  Info,
  Keyboard,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";

import { ITEM_COLOR_PRESETS, onColorText } from "@/lib/item-colors";
import { TagOriginMark } from "@/components/FileTable/tag-origin-mark";
import type { TagOrigin } from "@yard-core";
import { cn } from "@/lib/utils";

import { Button } from "./button";
import { Kbd } from "./field";
import { Radio, Switch } from "./controls";

// ---------------------------------------------------------------------------
// Bulk bar — multi-selection actions with staged library/disk removal.
// ---------------------------------------------------------------------------

export type RemoveStage = null | "choose" | { confirm: "library" | "disk" };

export function BulkBar({
  count,
  removeDefault,
  stage,
  onStageChange,
  onSaveAll,
  onAddToQueue,
  onAddToShelf,
  onTag,
  onConfirm,
  onClear,
  children,
}: {
  count: number;
  removeDefault: "library" | "disk";
  stage: RemoveStage;
  onStageChange: (stage: RemoveStage) => void;
  onSaveAll?: () => void;
  onAddToQueue?: () => void;
  onAddToShelf?: () => void;
  onTag?: () => void;
  /** Executes the confirmed removal (defaults to clearing the stage). */
  onConfirm?: () => void;
  onClear?: () => void;
  /** Extra actions (e.g. v2 selection contributions) rendered before Remove. */
  children?: ReactNode;
}) {
  return (
    <div
      role="toolbar"
      aria-label={`Bulk actions for ${count} selected sounds`}
      className="flex flex-wrap items-center gap-2 rounded-lg border border-[color-mix(in_oklab,var(--accent-fill)_40%,transparent)] bg-[color-mix(in_oklab,var(--accent-fill)_8%,transparent)] px-3 py-2 shadow-[0_0_24px_color-mix(in_oklab,var(--accent-fill)_10%,transparent),inset_0_1px_0_rgba(255,255,255,0.05)]"
    >
      <span className="font-mono text-xs font-semibold tabular-nums text-accent-text">
        {count} selected
      </span>
      <span className="flex-1" />
      {children}
      {onSaveAll ? (
        <Button tone="secondary" size="sm" onClick={onSaveAll}>
          <HeartGlyph />
          Save all
        </Button>
      ) : null}
      {onAddToQueue ? (
        <Button tone="secondary" size="sm" onClick={onAddToQueue}>
          <ListPlusGlyph />
          Add to queue
        </Button>
      ) : null}
      {onAddToShelf ? (
        <Button tone="secondary" size="sm" onClick={onAddToShelf}>
          <PuzzleGlyph />
          Add to Shelf
        </Button>
      ) : null}
      {onTag ? (
        <Button tone="secondary" size="sm" onClick={onTag}>
          <TagsGlyph />
          Tag
        </Button>
      ) : null}
      {stage === null ? (
        <Button tone="secondary" size="sm" onClick={() => onStageChange("choose")}>
          <Trash2 />
          Remove
        </Button>
      ) : stage === "choose" ? (
        <>
          {(["library", "disk"] as const).map((choice) => (
            <Button
              key={choice}
              tone="danger"
              size="sm"
              onClick={() => onStageChange({ confirm: choice })}
            >
              <Trash2 />
              {choice === "library" ? "From library" : "From disk"}
              {removeDefault === choice ? (
                <span className="rounded-full border border-[var(--vi-edge)] bg-black/30 px-1.5 py-px font-mono text-[9px] uppercase tracking-[0.1em] text-zinc-400">
                  Default
                </span>
              ) : null}
            </Button>
          ))}
          <Button tone="ghost" size="sm" aria-label="Cancel remove" onClick={() => onStageChange(null)}>
            <X />
          </Button>
        </>
      ) : (
        <>
          <Button
            tone="danger"
            size="sm"
            onClick={() => {
              if (onConfirm) {
                onConfirm();
              } else {
                onStageChange(null);
              }
            }}
          >
            Sure?
          </Button>
          <Button tone="ghost" size="sm" aria-label="Cancel remove" onClick={() => onStageChange(null)}>
            <X />
          </Button>
        </>
      )}
      {onClear ? (
        <Button tone="ghost" size="sm" onClick={onClear}>
          <X />
          Clear
        </Button>
      ) : null}
    </div>
  );
}

function HeartGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
    </svg>
  );
}

function ListPlusGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M11 12H3" />
      <path d="M16 6H3" />
      <path d="M16 18H3" />
      <path d="M18 9v6" />
      <path d="M21 12h-6" />
    </svg>
  );
}

function PuzzleGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 7.5V4a2 2 0 1 0-4 0v3.5a1.5 1.5 0 0 1-3 0V5a2 2 0 1 0-4 0v2a1.5 1.5 0 0 1 0 3H5a2 2 0 1 0 0 4h2a1.5 1.5 0 0 1 0 3V18a2 2 0 1 0 4 0v-1.5a1.5 1.5 0 0 1 3 0V20a2 2 0 1 0 4 0v-3.5a1.5 1.5 0 0 1 3 0V18a2 2 0 1 0 4 0v-8a2 2 0 0 0-2-2h-2a1.5 1.5 0 0 1 0-3Z" />
    </svg>
  );
}

function TagsGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" />
      <circle cx="7.5" cy="7.5" r=".5" fill="currentColor" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Scan stats — live sync counters.
// ---------------------------------------------------------------------------

export function ScanStat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string | number;
  tone?: "default" | "success" | "error";
}) {
  return (
    <div className="rounded-lg border border-[var(--vi-edge)] bg-black/25 p-2.5 transition-colors hover:border-[var(--vi-edge-hi)]">
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 truncate font-mono text-lg font-bold tabular-nums",
          tone === "success" && "text-emerald-300",
          tone === "error" && "text-accent-text",
          tone === "default" && "text-zinc-100",
        )}
      >
        {value}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Extension row — installed workflow tool row with a toggle.
// ---------------------------------------------------------------------------

export function ExtensionRow({
  monogram,
  name,
  version,
  settingsCount,
  description,
  enabled,
  onToggle,
}: {
  monogram: string;
  name: string;
  version: string;
  settingsCount?: number;
  description: string;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-[var(--vi-edge)] bg-black/25 px-3 py-2.5 transition-colors hover:border-[var(--vi-edge-hi)]">
      <span
        aria-hidden
        className="grid size-10 shrink-0 place-items-center rounded-lg border border-[color-mix(in_oklab,var(--accent-fill)_35%,transparent)] bg-[color-mix(in_oklab,var(--accent-fill)_12%,transparent)] text-[15px] font-bold text-accent-text"
      >
        {monogram}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[13px] font-semibold text-zinc-100">{name}</span>
          <span className="shrink-0 rounded border border-[var(--vi-edge)] px-1 font-mono text-[10px] text-zinc-500">
            v{version}
          </span>
          {typeof settingsCount === "number" ? (
            <span className="hidden shrink-0 rounded border border-[var(--vi-edge)] bg-white/[0.03] px-1 font-mono text-[10px] text-zinc-500 min-[420px]:block">
              {settingsCount} settings
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block truncate text-xs text-zinc-500">{description}</span>
      </span>
      <Switch label={`Toggle ${name}`} checked={enabled} onCheckedChange={onToggle} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Validation — path check results.
// ---------------------------------------------------------------------------

export function ValidationMsg({ valid }: { valid: boolean }) {
  return (
    <div
      role={valid ? "status" : "alert"}
      className={cn(
        "flex gap-3 rounded-lg border p-3.5",
        valid
          ? "border-[color-mix(in_oklab,var(--accent-fill)_35%,transparent)] bg-[color-mix(in_oklab,var(--accent-fill)_7%,transparent)]"
          : "border-[color-mix(in_oklab,var(--accent-fill)_45%,transparent)] bg-[color-mix(in_oklab,var(--accent-fill)_8%,transparent)]",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "grid size-6 shrink-0 place-items-center rounded-full [&_svg]:size-4",
          valid
            ? "bg-[color-mix(in_oklab,var(--accent-fill)_18%,transparent)] text-accent-text"
            : "bg-[color-mix(in_oklab,var(--accent-fill)_20%,transparent)] text-accent-text",
        )}
      >
        {valid ? <CheckCircle2 /> : <AlertCircle />}
      </span>
      <span className="min-w-0">
        <span className={cn("block text-[13px] font-semibold", valid ? "text-zinc-100" : "text-accent-text")}>
          {valid ? "Path verified" : "Invalid folder"}
        </span>
        <span className="mt-0.5 block text-xs text-zinc-400">
          {valid ? "Found 214 supported audio files." : "The path does not exist or is not readable."}
        </span>
        {valid ? (
          <span className="mt-2 block truncate rounded-md border border-[var(--vi-edge)] bg-black/30 px-2 py-1.5 font-mono text-[10px] text-zinc-400">
            C:/Sound Library/SFX
          </span>
        ) : null}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shortcut row — press-to-rebind keys.
// ---------------------------------------------------------------------------

export function ShortcutRow({
  label,
  binding,
  rebinding,
  onStart,
  onCancel,
}: {
  label: string;
  binding: string;
  rebinding: boolean;
  onStart: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex items-center gap-3 py-2">
      <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-zinc-100">{label}</p>
      <Kbd>
        <span className={cn("px-1", rebinding && "animate-pulse text-accent-text")}>
          {rebinding ? "Press a key…" : binding === "Space" ? "Space" : binding.toUpperCase()}
        </span>
      </Kbd>
      <Button tone="ghost" size="sm" onClick={() => (rebinding ? onCancel() : onStart())}>
        {rebinding ? "Cancel" : "Change"}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Coverage row — board tag progress.
// ---------------------------------------------------------------------------

export function CoverRow({
  tag,
  delta,
  count,
  goal,
  active,
  onSelect,
}: {
  tag: string;
  delta: number;
  count: number;
  goal: number;
  active: boolean;
  onSelect: () => void;
}) {
  const pct = Math.min(1, count / goal);
  const done = count >= goal;
  const empty = count === 0;
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={active}
        className={cn(
          "relative flex w-full flex-col gap-1.5 border-b border-[var(--vi-edge)] px-3 py-2.5 text-left outline-none transition-colors last:border-b-0 hover:bg-white/[0.03]",
          "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--vi-focus)]",
          active && "bg-[color-mix(in_oklab,var(--accent-fill)_8%,transparent)]",
        )}
      >
        {active ? (
          <span aria-hidden className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-accent-fill shadow-[0_0_12px_color-mix(in_oklab,var(--accent-fill)_40%,transparent)]" />
        ) : null}
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate font-mono text-[13px] font-bold text-zinc-100">
            #{tag}
          </span>
          {delta > 0 ? (
            <span className="shrink-0 font-mono text-[10px] tabular-nums text-emerald-300">
              +{delta}
            </span>
          ) : null}
          <span
            className={cn(
              "shrink-0 font-mono text-xs tabular-nums",
              done ? "text-emerald-300" : empty ? "text-zinc-600" : "text-zinc-100",
            )}
          >
            {count}
            <span className="text-zinc-600">/{goal}</span>
          </span>
        </span>
        <span className="h-1 overflow-hidden rounded-full bg-white/[0.06]">
          <span
            className={cn(
              "block h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none",
              done ? "bg-emerald-400" : empty ? "bg-transparent" : "bg-accent-fill",
            )}
            style={{ width: `${pct * 100}%` }}
          />
        </span>
      </button>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Candidate queue — words awaiting review, with promote/dismiss.
// ---------------------------------------------------------------------------

export const QUEUE_PAGE_SIZE = 5;

export function QueueCard({
  words,
  page,
  onPage,
  onPromote,
  onDismiss,
  hideSummary = false,
}: {
  words: Array<{ word: string; files: number }>;
  page: number;
  onPage: (page: number) => void;
  onPromote: (word: string) => void;
  onDismiss: (word: string) => void;
  /** Hide the "{n} words need review" summary line (the section title already says it). */
  hideSummary?: boolean;
}) {
  const maxPage = Math.max(0, Math.ceil(words.length / QUEUE_PAGE_SIZE) - 1);
  const safePage = Math.min(page, maxPage);
  const visible = words.slice(safePage * QUEUE_PAGE_SIZE, safePage * QUEUE_PAGE_SIZE + QUEUE_PAGE_SIZE);

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h3 className="text-[13px] font-semibold text-zinc-100">Candidate queue</h3>
        {!hideSummary ? (
          <p className="font-mono text-[11px] text-zinc-500">
            {words.length} word{words.length === 1 ? "" : "s"} need review
          </p>
        ) : null}
      </div>
      {visible.length === 0 ? (
        <p className="py-3 text-[13px] text-zinc-500">Queue empty. Every word is covered.</p>
      ) : (
        <ul className="mt-2 divide-y divide-white/[0.06] border-y border-[var(--vi-edge)]">
          {visible.map((item) => (
            <li key={item.word} className="group flex items-center gap-2 py-1.5">
              <span className="min-w-0 flex-1 truncate text-[13px] text-zinc-200">
                {item.word}
                <span className="ml-2 font-mono text-[11px] text-zinc-600">
                  {item.files} files
                </span>
              </span>
              <Button
                tone="ghost"
                size="icon"
                className="size-7 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
                aria-label={`Promote ${item.word} to a tag`}
                onClick={() => onPromote(item.word)}
              >
                <Check />
              </Button>
              <Button
                tone="ghost"
                size="icon"
                className="size-7 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
                aria-label={`Dismiss ${item.word}`}
                onClick={() => onDismiss(item.word)}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex items-center justify-between">
        <p className="font-mono text-[11px] text-zinc-600">
          Showing {words.length === 0 ? 0 : safePage * QUEUE_PAGE_SIZE + 1}–
          {Math.min(words.length, safePage * QUEUE_PAGE_SIZE + QUEUE_PAGE_SIZE)} of {words.length}
        </p>
        <div className="flex gap-1">
          <Button
            tone="ghost"
            size="icon"
            className="size-7"
            aria-label="Previous queue page"
            disabled={safePage === 0}
            onClick={() => onPage(safePage - 1)}
          >
            <ChevronLeft />
          </Button>
          <Button
            tone="ghost"
            size="icon"
            className="size-7"
            aria-label="Next queue page"
            disabled={safePage >= maxPage}
            onClick={() => onPage(safePage + 1)}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Provenance — tag origin chips.
// ---------------------------------------------------------------------------

export function ProvTag({
  name,
  selected = false,
  provenance,
  confidence,
}: {
  name: string;
  selected?: boolean;
  provenance?: TagOrigin | null;
  confidence?: number | null;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] items-center gap-1 rounded-[4px] border px-1.5 font-mono text-[11px] shadow-[var(--vi-sink)]",
        selected
          ? "border-[color-mix(in_oklab,var(--accent-fill)_55%,transparent)] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--accent-fill)_22%,transparent),color-mix(in_oklab,var(--accent-fill)_10%,transparent))] text-zinc-50"
          : "border-[var(--vi-edge)] bg-[rgba(0,0,0,0.38)] text-zinc-300",
      )}
    >
      <span className="text-zinc-600">#</span>
      {name}
      {provenance ? <TagOriginMark origin={provenance} confidence={confidence} /> : null}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Onboarding stepper.
// ---------------------------------------------------------------------------

export function StepDot({ active, completed }: { active: boolean; completed: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "block size-2.5 rounded-full border border-white/15 bg-white/10 transition-colors",
        active && "border-accent-fill bg-accent-fill shadow-[0_0_10px_color-mix(in_oklab,var(--accent-fill)_50%,transparent)]",
        completed && "border-accent-fill/70 bg-accent-fill/70",
      )}
    />
  );
}

export function StepLine({ active }: { active: boolean }) {
  return <span aria-hidden className={cn("mx-1 h-px w-6 bg-white/10 sm:w-8", active && "bg-accent-fill/70")} />;
}

export function OnboardingStepper({
  steps,
  stepIndex,
  onSelect,
}: {
  steps: ReadonlyArray<string>;
  stepIndex: number;
  onSelect: (index: number) => void;
}) {
  return (
    <ol className="flex items-center">
      {steps.map((step, index) => (
        <li key={step} className="flex items-center last:flex-none">
          <button
            type="button"
            onClick={() => onSelect(index)}
            aria-label={`Go to step ${step}`}
            aria-current={stepIndex === index ? "step" : undefined}
            className="group flex flex-col items-center gap-1.5 outline-none"
          >
            <StepDot active={stepIndex === index} completed={stepIndex > index} />
            <span
              className={cn(
                "font-mono text-[10px]",
                stepIndex === index ? "text-zinc-100" : "text-zinc-600 group-hover:text-zinc-400",
              )}
            >
              {step}
            </span>
          </button>
          {index < steps.length - 1 ? <StepLine active={stepIndex > index} /> : null}
        </li>
      ))}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// Breadcrumb + directory rows — folder browser.
// ---------------------------------------------------------------------------

export function Breadcrumb({
  crumbs,
  onNavigate,
}: {
  crumbs: ReadonlyArray<string>;
  onNavigate: (index: number) => void;
}) {
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 font-mono text-[11px]">
      {crumbs.map((crumb, index) => (
        <span key={`${index}-${crumb}`} className="flex items-center gap-1">
          {index > 0 ? <ChevronRight aria-hidden className="size-3 text-zinc-700" /> : null}
          <button
            type="button"
            onClick={() => onNavigate(index)}
            aria-current={index === crumbs.length - 1 ? "page" : undefined}
            className={cn(
              "rounded px-1 py-0.5 outline-none transition-colors",
              "focus-visible:ring-2 focus-visible:ring-[var(--vi-focus)]",
              index === crumbs.length - 1
                ? "text-zinc-100"
                : "text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200",
            )}
          >
            {crumb}
          </button>
        </span>
      ))}
    </nav>
  );
}

export function DirectoryRow({
  label,
  subtitle,
  onClick,
}: {
  label: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-3 border-b border-[var(--vi-edge)] px-3 py-2.5 text-left outline-none transition-colors last:border-b-0 hover:bg-white/[0.03] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--vi-focus)]"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-md border border-[var(--vi-edge)] bg-white/[0.03] text-zinc-500 transition-colors group-hover:border-[var(--vi-edge-hi)] group-hover:text-zinc-300 [&_svg]:size-4">
        <Folder />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-zinc-100">{label}</span>
        <span className="mt-0.5 block truncate font-mono text-[11px] text-zinc-500">{subtitle}</span>
      </span>
      <ChevronRight
        aria-hidden
        className="size-4 shrink-0 text-zinc-600 transition-[transform,color] duration-150 group-hover:translate-x-0.5 group-hover:text-zinc-300 motion-reduce:transition-none"
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Empty state — no-results placeholder.
// ---------------------------------------------------------------------------

export function EmptyState({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center px-4 py-6 text-center">
      <span
        aria-hidden
        className="grid size-11 place-items-center rounded-xl border border-[var(--vi-edge)] bg-white/[0.03] text-zinc-500 shadow-[var(--vi-lift)] [&_svg]:size-5"
      >
        <Search />
      </span>
      <p className="mt-3 text-sm font-medium text-zinc-100">{title}</p>
      <p className="mt-1 max-w-56 text-xs leading-relaxed text-zinc-500">{body}</p>
      {actionLabel && onAction ? (
        <Button tone="ghost" size="sm" className="mt-3" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Drop offer — extension drop target.
// ---------------------------------------------------------------------------

export function DropOffer({
  active,
  title,
  subtitle,
  onClick,
}: {
  active: boolean;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex w-full flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-6 outline-none transition-[border-color,background-color,box-shadow] duration-150",
        "focus-visible:ring-2 focus-visible:ring-[var(--vi-focus)]",
        active
          ? "border-[color-mix(in_oklab,var(--accent-fill)_65%,transparent)] bg-[color-mix(in_oklab,var(--accent-fill)_8%,transparent)] shadow-[0_0_28px_color-mix(in_oklab,var(--accent-fill)_14%,transparent)]"
          : "border-[var(--vi-edge-hi)] bg-white/[0.015] hover:border-[color-mix(in_oklab,var(--accent-fill)_40%,transparent)] hover:bg-[color-mix(in_oklab,var(--accent-fill)_4%,transparent)]",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "grid size-10 place-items-center rounded-full border [&_svg]:size-5",
          active
            ? "border-[color-mix(in_oklab,var(--accent-fill)_55%,transparent)] bg-[color-mix(in_oklab,var(--accent-fill)_14%,transparent)] text-accent-text"
            : "border-[var(--vi-edge)] bg-white/[0.03] text-zinc-400",
        )}
      >
        <FileUp />
      </span>
      <span className="text-[13px] font-medium text-zinc-100">{title}</span>
      <span className="font-mono text-[11px] text-zinc-500">{subtitle}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Tool card — extension tools grid entry.
// ---------------------------------------------------------------------------

export function ToolCard({
  monogram,
  name,
  version,
  description,
  perms,
  approved,
  enabled,
  canRun,
  runLabel,
  onRun,
  onToggle,
  onToggleInfo,
  expanded,
}: {
  monogram: string;
  name: string;
  version: string;
  description: string;
  perms: ReadonlyArray<string>;
  approved: boolean;
  enabled: boolean;
  canRun: boolean;
  runLabel?: string;
  onRun?: () => void;
  onToggle: (enabled: boolean) => void;
  onToggleInfo: () => void;
  expanded: boolean;
}) {
  return (
    <div className="rounded-lg border border-[var(--vi-edge)] bg-black/25 p-3 transition-colors hover:border-[var(--vi-edge-hi)]">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="grid size-11 shrink-0 place-items-center rounded-lg border border-[color-mix(in_oklab,var(--accent-fill)_35%,transparent)] bg-[color-mix(in_oklab,var(--accent-fill)_12%,transparent)] text-[15px] font-bold text-accent-text"
        >
          {monogram}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-zinc-50">{name}</span>
          <span className="mt-0.5 block truncate text-xs text-zinc-500">{description}</span>
          <span className="mt-1 block font-mono text-[10px] text-zinc-600">
            v{version} · {perms.length} permission{perms.length === 1 ? "" : "s"} · v2
          </span>
        </span>
        {canRun && onRun ? (
          <Button tone="secondary" size="sm" onClick={onRun}>
            <ArrowUpRight />
            {runLabel ?? "Run"}
          </Button>
        ) : null}
        <Button
          tone="ghost"
          size="icon"
          className="size-8"
          aria-label={`View ${name} details`}
          aria-expanded={expanded}
          onClick={onToggleInfo}
        >
          <Info />
        </Button>
        <Switch
          label={`Toggle ${name}`}
          checked={enabled}
          onCheckedChange={onToggle}
        />
      </div>
      {expanded ? (
        <div className="mt-2.5 border-t border-[var(--vi-edge)] pt-2.5">
          <div className="flex flex-wrap gap-1.5">
            {perms.map((perm) => (
              <span
                key={perm}
                className={cn(
                  "rounded border px-1.5 py-0.5 font-mono text-[10.5px]",
                  approved
                    ? "border-emerald-300/25 bg-emerald-300/[0.06] text-emerald-200"
                    : "border-[var(--vi-edge)] bg-white/[0.03] text-zinc-400",
                )}
              >
                {perm}
              </span>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="font-mono text-[10.5px] text-zinc-600">
              {approved ? "Approved for this device" : "Needs approval"}
            </p>
            {approved ? null : (
              <Button tone="secondary" size="sm" onClick={onToggleInfo}>
                Approve
              </Button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Organize tags — color chips, editor, composer.
// ---------------------------------------------------------------------------

export function TagChip({
  tag,
  active,
  onClick,
  onEdit,
}: {
  tag: { id: string; name: string; color: string };
  active: boolean;
  onClick: () => void;
  onEdit: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onDoubleClick={onEdit}
      title="Click to filter · double-click to edit"
      aria-pressed={active}
      style={
        active
          ? { borderColor: `${tag.color}80`, backgroundColor: `${tag.color}14` }
          : undefined
      }
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold outline-none transition-[background-color,border-color,transform] duration-150 motion-safe:active:scale-95",
        "focus-visible:ring-2 focus-visible:ring-[var(--vi-focus)]",
        active
          ? "text-zinc-100"
          : "border-[var(--vi-edge)] bg-white/[0.04] text-zinc-300 hover:bg-white/[0.06]",
      )}
    >
      <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: tag.color }} />
      {tag.name}
    </button>
  );
}

export function ColorSwatch({
  color,
  selected,
  onPick,
}: {
  color: string;
  selected: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-label={`Pick ${color}`}
      aria-pressed={selected}
      style={{ backgroundColor: color }}
      className={cn(
        "size-5 rounded-full outline-none transition-[transform,opacity] duration-150 motion-safe:hover:scale-110 motion-safe:active:scale-95",
        "focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black",
        selected
          ? "ring-2 ring-white ring-offset-2 ring-offset-black"
          : "opacity-70 hover:opacity-100",
      )}
    />
  );
}

/** Inline tag rename editor with delete arm and a color swatch row. */
export function TagEditor({
  name,
  color,
  armed,
  onNameChange,
  onColorChange,
  onCommit,
  onCancel,
  onDelete,
  onArmDelete,
  onDeleteCancel,
}: {
  name: string;
  color: string;
  armed: boolean;
  onNameChange: (name: string) => void;
  onColorChange: (color: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  onDelete: () => void;
  /** Arms the delete confirmation; only the armed "Sure?" button deletes. */
  onArmDelete: () => void;
  onDeleteCancel: () => void;
}) {
  return (
    <span className="w-full max-w-md rounded-lg border border-[color-mix(in_oklab,var(--accent-fill)_50%,transparent)] bg-[color-mix(in_oklab,var(--accent-fill)_7%,transparent)] p-2">
      <span className="flex items-center gap-2">
        <span aria-hidden className="size-3 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <input
          autoFocus
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          onBlur={onCommit}
          onKeyDown={(event) => {
            if (event.key === "Enter") onCommit();
            if (event.key === "Escape") {
              onCancel();
              onDeleteCancel();
            }
          }}
          aria-label="Rename tag"
          className="min-w-0 flex-1 rounded-md border border-[var(--vi-edge)] bg-[rgba(0,0,0,0.38)] px-2 py-1 text-xs font-semibold text-zinc-100 outline-none focus:border-[color-mix(in_oklab,var(--accent-fill)_60%,transparent)]"
        />
        {armed ? (
          <>
            <Button
              tone="danger"
              size="sm"
              className="h-6 px-2 text-[11px]"
              onClick={onDelete}
            >
              Sure?
            </Button>
            <Button
              tone="ghost"
              size="icon"
              className="size-6 [&_svg]:size-3"
              aria-label="Cancel delete"
              onClick={onDeleteCancel}
            >
              <X />
            </Button>
          </>
        ) : (
          <>
            <Button
              tone="ghost"
              size="icon"
              className="size-6 [&_svg]:size-3"
              aria-label="Delete tag"
              onClick={onArmDelete}
            >
              <Trash2 />
            </Button>
            <Button
              tone="ghost"
              size="icon"
              className="size-6 [&_svg]:size-3"
              aria-label="Done editing"
              onClick={onCancel}
            >
              <X />
            </Button>
          </>
        )}
      </span>
      <span className="mt-1.5 flex items-center gap-1.5 px-1 pb-0.5">
        {ITEM_COLOR_PRESETS.map((preset) => (
          <ColorSwatch
            key={preset}
            color={preset}
            selected={color === preset}
            onPick={() => onColorChange(preset)}
          />
        ))}
      </span>
    </span>
  );
}

/** New-tag composer with name input, color row, and actions. */
export function TagComposer({
  name,
  color,
  onNameChange,
  onColorChange,
  onSubmit,
  onCancel,
}: {
  name: string;
  color: string;
  onNameChange: (name: string) => void;
  onColorChange: (color: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mt-2 max-w-md rounded-lg border border-dashed border-[var(--vi-edge-hi)] p-3">
      <div className="flex items-center gap-3">
        <input
          autoFocus
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && name.trim()) onSubmit();
            if (event.key === "Escape") onCancel();
          }}
          placeholder="Tag name…"
          aria-label="New tag name"
          className="min-w-0 flex-1 rounded-md border border-[var(--vi-edge)] bg-[rgba(0,0,0,0.38)] px-2.5 py-1.5 text-[13px] font-semibold text-zinc-100 outline-none placeholder:font-normal placeholder:text-zinc-600 focus:border-[color-mix(in_oklab,var(--accent-fill)_60%,transparent)]"
        />
        <span className="flex shrink-0 items-center gap-1.5">
          {ITEM_COLOR_PRESETS.map((preset) => (
            <ColorSwatch
              key={preset}
              color={preset}
              selected={color === preset}
              onPick={() => onColorChange(preset)}
            />
          ))}
        </span>
      </div>
      <div className="mt-2.5 flex justify-end gap-2">
        <Button tone="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <button
          type="button"
          disabled={!name.trim()}
          onClick={onSubmit}
          style={{ backgroundColor: color, color: onColorText(color) }}
          className="rounded-md px-3.5 py-1.5 text-xs font-semibold outline-none transition-[transform,opacity,filter] duration-150 hover:brightness-110 motion-safe:active:scale-95 focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none"
        >
          Add tag
        </button>
      </div>
    </div>
  );
}

export function NewTagButton({
  open,
  onClick,
}: {
  open: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="New tag"
      aria-expanded={open}
      className="grid size-5 place-items-center rounded-full border border-dashed border-white/20 text-zinc-500 outline-none transition-[border-color,color,transform] duration-150 hover:border-[color-mix(in_oklab,var(--accent-fill)_60%,transparent)] hover:text-accent-text motion-safe:active:scale-90 focus-visible:ring-2 focus-visible:ring-[var(--vi-focus)] [&_svg]:size-3"
    >
      <Plus />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Setting row — validated extension settings.
// ---------------------------------------------------------------------------

export function SettingRow({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-[var(--vi-edge)] px-3 py-2.5">
      <p className="text-[13px] font-medium text-zinc-100">{title}</p>
      {description ? <div className="mt-0.5 text-xs text-zinc-500">{description}</div> : null}
      <div className="mt-2">{children}</div>
    </div>
  );
}

export function SettingSwitchRow({
  title,
  description,
  checked,
  onCheckedChange,
  switchLabel,
}: {
  title: string;
  description?: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  switchLabel: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--vi-edge)] px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-zinc-100">{title}</p>
        {description ? (
          <div className="mt-0.5 truncate font-mono text-[10px] text-zinc-600">{description}</div>
        ) : null}
      </div>
      <Switch label={switchLabel} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pack options — make-pack source and format.
// ---------------------------------------------------------------------------

export function PackSourceOption({
  value,
  label,
  description,
  selected,
  onSelect,
}: {
  value: string;
  label: string;
  description: string;
  selected: boolean;
  onSelect: (value: string) => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={() => onSelect(value)}
      className={cn(
        "flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left outline-none transition-[border-color,background-color] duration-150",
        "focus-visible:ring-2 focus-visible:ring-[var(--vi-focus)]",
        selected
          ? "border-[color-mix(in_oklab,var(--accent-fill)_50%,transparent)] bg-[color-mix(in_oklab,var(--accent-fill)_8%,transparent)]"
          : "border-[var(--vi-edge)] bg-black/25 hover:border-[var(--vi-edge-hi)]",
      )}
    >
      <Radio
        name="vi-pack-source"
        label={label}
        checked={selected}
        onChange={() => onSelect(value)}
      />
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-medium text-zinc-100">{label}</span>
        <span className="block truncate text-xs text-zinc-500">{description}</span>
      </span>
    </button>
  );
}

export function PackFormatOption({
  value,
  label,
  selected,
  onSelect,
}: {
  value: string;
  label: string;
  selected: boolean;
  onSelect: (value: string) => void;
}) {
  return (
    <button
      key={value}
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={() => onSelect(value)}
      className={cn(
        "rounded-lg border px-3 py-2 font-mono text-xs outline-none transition-[border-color,background-color,color] duration-150",
        "focus-visible:ring-2 focus-visible:ring-[var(--vi-focus)]",
        selected
          ? "border-[color-mix(in_oklab,var(--accent-fill)_55%,transparent)] bg-[color-mix(in_oklab,var(--accent-fill)_12%,transparent)] font-bold text-accent-text"
          : "border-[var(--vi-edge)] bg-black/25 text-zinc-400 hover:border-[var(--vi-edge-hi)] hover:text-zinc-200",
      )}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Skeleton tiles — loading placeholders.
// ---------------------------------------------------------------------------

export function SkeletonRow() {
  return (
    <div className="flex animate-pulse items-center gap-3 rounded-lg border border-[var(--vi-edge)] bg-black/25 px-3 py-2.5 motion-reduce:animate-none">
      <span className="size-10 shrink-0 rounded-lg bg-white/[0.06]" />
      <span className="min-w-0 flex-1">
        <span className="block h-3 w-2/3 rounded bg-white/[0.07]" />
        <span className="mt-1.5 block h-2.5 w-1/2 rounded bg-white/[0.05]" />
      </span>
      <span className="h-[18px] w-[34px] shrink-0 rounded-full bg-white/[0.06]" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Misc glyph passthroughs used by the specimen header.
// ---------------------------------------------------------------------------

export function ShortcutHint({ children }: { children: ReactNode }) {
  return (
    <p className="mt-2 flex items-center gap-1.5 text-[11px] text-zinc-600">
      <Keyboard aria-hidden className="size-3.5" />
      {children}
    </p>
  );
}