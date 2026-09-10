"use client";

import { useCallback, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ArrowUpRight, Info } from "lucide-react";

import { Button, EmptyState, SkeletonRow, Switch } from "@/components/variant-i";
import { cn } from "@/lib/utils";
import type { ExtensionGridItem } from "@/lib/extensions/types";

function getPrimaryAction(extension: ExtensionGridItem): {
  label: string;
  command: string;
} | null {
  const map: Record<string, { label: string; command: string }> = {
    "folder-janitor": {
      label: "Scan library",
      command: "folder-janitor.scan-library",
    },
    "library-gatherer": {
      label: "Gather library",
      command: "library-gatherer.gather",
    },
    "make-pack": {
      label: "Make pack",
      command: "make-pack.from-recent",
    },
    "sound-shelf": {
      label: "Clear shelf",
      command: "sound-shelf.clear",
    },
    "drop-rules": {
      label: "Configure rules",
      command: "drop-rules.open-settings",
    },
  };
  return map[extension.id] ?? null;
}

function V3ExtensionCard({
  extension,
  isPending,
  onOpenDetails,
  onToggleEnabled,
  onRunCommand,
}: {
  extension: ExtensionGridItem;
  isPending: boolean;
  onOpenDetails?: (extension: ExtensionGridItem) => void;
  onToggleEnabled?: (extensionId: string, enabled: boolean) => void;
  onRunCommand?: (extensionId: string, commandId: string) => void;
}) {
  const handleToggle = useCallback(() => {
    if (isPending) return;
    onToggleEnabled?.(extension.id, !extension.enabled);
  }, [extension.id, extension.enabled, isPending, onToggleEnabled]);

  const primaryAction = getPrimaryAction(extension);

  const handlePrimaryAction = useCallback(() => {
    if (primaryAction) {
      onRunCommand?.(extension.id, primaryAction.command);
    }
  }, [extension.id, primaryAction, onRunCommand]);

  return (
    <div className="flex items-center gap-3 rounded-lg border border-[var(--vi-edge)] bg-black/25 p-3 transition-colors hover:border-[var(--vi-edge-hi)]">
      <span
        aria-hidden
        className="grid size-11 shrink-0 place-items-center rounded-lg border border-[color-mix(in_oklab,var(--accent-fill)_35%,transparent)] bg-[color-mix(in_oklab,var(--accent-fill)_12%,transparent)] text-[15px] font-bold text-accent-text"
      >
        {extension.name.slice(0, 2).toUpperCase()}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-zinc-50">
          {extension.name}
        </span>
        <span className="mt-0.5 block truncate text-xs text-zinc-500">
          {extension.description}
        </span>
        <span className="mt-1 block font-mono text-[10px] text-zinc-600">
          v{extension.version} ·{" "}
          {extension.settingsCount
            ? `${extension.settingsCount} settings`
            : "no settings"}{" "}
          · v1
        </span>
      </span>

      {primaryAction ? (
        <Button
          tone="secondary"
          size="sm"
          className="hidden sm:inline-flex"
          onClick={(event) => {
            event.stopPropagation();
            handlePrimaryAction();
          }}
        >
          <ArrowUpRight />
          <span className="truncate">{primaryAction.label}</span>
        </Button>
      ) : null}

      <Button
        tone="ghost"
        size="icon"
        className="size-8"
        aria-label={`View ${extension.name} details`}
        title="Extension details"
        onClick={(event) => {
          event.stopPropagation();
          onOpenDetails?.(extension);
        }}
      >
        <Info />
      </Button>

      <span className={cn("shrink-0", isPending && "cursor-not-allowed opacity-60")}>
        <Switch
          label={`Toggle ${extension.name}`}
          checked={extension.enabled}
          onCheckedChange={handleToggle}
        />
      </span>
    </div>
  );
}

export function V3ExtensionGrid({
  extensions = [],
  isLoading = false,
  onOpenDetails,
  onToggleEnabled,
  onRunCommand,
  pendingExtensionId = null,
  trailing,
  trailingCount = 0,
}: {
  extensions: ExtensionGridItem[];
  isLoading?: boolean;
  onToggleEnabled?: (extensionId: string, enabled: boolean) => void;
  onOpenDetails?: (extension: ExtensionGridItem) => void;
  onRunCommand?: (extensionId: string, commandId: string) => void;
  pendingExtensionId?: string | null;
  /** Extra cards (e.g. v2 extensions) rendered inside the same grid. */
  trailing?: ReactNode;
  /** Count of trailing cards; the empty state shows only when both lists are empty. */
  trailingCount?: number;
}) {
  const skeletonCount = 6;
  // v1 is fully retired so its list is permanently empty; trailing v2
  // cards keep the grid alive. The empty state shows only when neither
  // generation has anything to display.
  const showEmptyState = !isLoading && extensions.length === 0 && trailingCount === 0;

  const [mouse, setMouse] = useState({ x: 50, y: 50 });
  const rafRef = useRef<number | null>(null);
  const mouseRef = useRef({ x: 50, y: 50 });

  const handleGridMouseMove = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      mouseRef.current = {
        x: ((event.clientX - rect.left) / rect.width) * 100,
        y: ((event.clientY - rect.top) / rect.height) * 100,
      };
      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null;
          setMouse({ ...mouseRef.current });
        });
      }
    },
    [],
  );

  return (
    <div
      className="relative flex flex-1 flex-col overflow-hidden px-6 py-6"
      onMouseMove={handleGridMouseMove}
    >
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background: `radial-gradient(circle 24rem at ${mouse.x}% ${mouse.y}%, color-mix(in oklab, var(--accent-fill) 4%, transparent), transparent 54%)`,
        }}
      />

      <div className="relative z-10 flex-1">
        {showEmptyState ? (
          <>
            <div className="flex min-h-64 flex-1 items-center justify-center">
              <EmptyState
                title="No extensions registered"
                body="Installed local extensions appear here once they are registered with the Foleyard runtime."
              />
            </div>
            {trailing ? (
              <div className="mt-3 grid gap-3 xl:grid-cols-2">{trailing}</div>
            ) : null}
          </>
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {isLoading
              ? Array.from({ length: skeletonCount }).map((_, index) => (
                  <SkeletonRow key={index} />
                ))
              : extensions.map((extension) => (
                  <V3ExtensionCard
                    key={extension.id}
                    extension={extension}
                    isPending={pendingExtensionId === extension.id}
                    onOpenDetails={onOpenDetails}
                    onToggleEnabled={onToggleEnabled}
                    onRunCommand={onRunCommand}
                  />
                ))}
            {trailing}
          </div>
        )}
      </div>
    </div>
  );
}