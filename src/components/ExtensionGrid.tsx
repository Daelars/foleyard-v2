"use client";

import type { ExtensionGridItem } from "../lib/extensions/types";
import { useCallback, useRef, useState } from "react";
import { ArrowUpRight, Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";



type ExtensionGridProps = {
  extensions: ExtensionGridItem[];
  isLoading?: boolean;
  onToggleEnabled?: (extensionId: string, enabled: boolean) => void;
  onOpenDetails?: (extension: ExtensionGridItem) => void;
  onRunCommand?: (extensionId: string, commandId: string) => void;
  pendingExtensionId?: string | null;
};

const skeletonCount = 6;

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

function ExtensionCard({
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
    onToggleEnabled?.(extension.id, !extension.enabled);
  }, [extension.id, extension.enabled, onToggleEnabled]);

  const primaryAction = getPrimaryAction(extension);

  const handlePrimaryAction = useCallback(() => {
    if (primaryAction) {
      onRunCommand?.(extension.id, primaryAction.command);
    }
  }, [extension.id, primaryAction, onRunCommand]);

  return (
    <div className="group flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 transition-colors hover:bg-white/[0.06]">
      <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent-fill/12 text-lg font-bold text-accent-text">
        {extension.name.slice(0, 2).toUpperCase()}
      </div>

      <div className="min-w-0 flex-1">
        <p className="font-semibold leading-tight text-zinc-50">
          {extension.name}
        </p>
        <p className="mt-0.5 truncate text-xs font-medium text-zinc-400">
          {extension.description}
        </p>
        <p className="mt-1 font-mono text-[10px] text-zinc-500">
          v{extension.version} ·{" "}
          {extension.settingsCount
            ? `${extension.settingsCount} settings`
            : "no settings"}
        </p>
      </div>

      {primaryAction && (
        <Button
          variant="ghost"
          className="hidden h-8 shrink-0 gap-1.5 rounded-lg border border-accent-fill/40 bg-accent-fill/10 px-2.5 text-[11px] text-accent-text hover:bg-accent-fill/15 hover:text-accent-text sm:inline-flex"
          onClick={(e) => {
            e.stopPropagation();
            handlePrimaryAction();
          }}
        >
          <ArrowUpRight className="size-3 shrink-0" />
          <span className="truncate">{primaryAction.label}</span>
        </Button>
      )}

      <Button
        variant="ghost"
        size="icon"
        className="size-8 shrink-0 rounded-lg border border-white/10 bg-white/5 text-zinc-400 hover:border-accent-fill/50 hover:bg-white/[0.08] hover:text-zinc-100"
        onClick={(e) => {
          e.stopPropagation();
          onOpenDetails?.(extension);
        }}
        aria-label={`View ${extension.name} details`}
        title="Extension details"
      >
        <span className="sr-only">Extension details</span>
        <Info className="size-3.5" />
      </Button>

      <Switch
        checked={extension.enabled}
        onCheckedChange={handleToggle}
        disabled={isPending}
        aria-label={`Toggle ${extension.name}`}
        className="shrink-0"
      />
    </div>
  );
}

function ExtensionCardSkeleton() {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <div className="size-11 shrink-0 animate-pulse rounded-xl bg-white/5" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="h-4 w-32 animate-pulse rounded bg-white/5" />
        <div className="h-3 w-full animate-pulse rounded bg-white/5" />
      </div>
      <div className="size-8 shrink-0 animate-pulse rounded-lg bg-white/5" />
      <div className="h-6 w-11 shrink-0 animate-pulse rounded-full bg-white/5" />
    </div>
  );
}

export function ExtensionGrid({
  extensions = [],
  isLoading = false,
  onOpenDetails,
  onToggleEnabled,
  onRunCommand,
  pendingExtensionId = null,
}: ExtensionGridProps) {
  const showEmptyState = !isLoading && extensions.length === 0;

  const [mouse, setMouse] = useState({ x: 50, y: 50 });
  const rafRef = useRef<number | null>(null);
  const mouseRef = useRef({ x: 50, y: 50 });

  const handleGridMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      mouseRef.current = {
        x: ((e.clientX - rect.left) / rect.width) * 100,
        y: ((e.clientY - rect.top) / rect.height) * 100,
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
          background: `radial-gradient(circle 24rem at ${mouse.x}% ${mouse.y}%, color-mix(in oklab, var(--primary) 4%, transparent), transparent 54%)`,
        }}
      />

      <div className="relative z-10 flex-1">
      {showEmptyState ? (
        <div className="flex min-h-64 flex-1 items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 text-center">
          <div className="max-w-md space-y-2">
            <p className="text-sm font-medium text-zinc-200">No extensions registered</p>
            <p className="text-sm text-zinc-500">
              Installed local extensions appear here once they are registered
              with the Foleyard runtime.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {isLoading
            ? Array.from({ length: skeletonCount }).map((_, index) => (
                <ExtensionCardSkeleton key={index} />
              ))
            : extensions.map((extension) => (
                <ExtensionCard
                  key={extension.id}
                  extension={extension}
                  isPending={pendingExtensionId === extension.id}
                  onOpenDetails={onOpenDetails}
                  onToggleEnabled={onToggleEnabled}
                  onRunCommand={onRunCommand}
                />
              ))}
        </div>
      )}
      </div>
    </div>
  );
}
