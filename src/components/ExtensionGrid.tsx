"use client";

import { useCallback, useRef, useState } from "react";
import { ArrowUpRight, Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

export type ExtensionGridItem = {
  id: string;
  name: string;
  provider: string;
  version: string;
  description: string;
  category: string;
  enabled: boolean;
  commandCount?: number;
  permissionCount?: number;
  surfaceCount?: number;
  commands?: Array<{
    id: string;
    title: string;
  }>;
  permissions?: string[];
  surfaces?: string[];
  settingsCount?: number;
  settings?: Array<{
    id: string;
    label: string;
    description?: string;
    type: "boolean" | "string" | "number" | "select" | "path";
    defaultValue: unknown;
    value: unknown;
    options?: Array<{
      label: string;
      value: string;
    }>;
  }>;
};

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
    <div className="relative flex min-h-64 flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] sm:min-h-72 xl:min-h-80">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,color-mix(in_oklab,var(--primary)_8%,transparent),transparent_48%)]" />
      <div className="absolute right-3 top-3 z-10">
        <Switch
          checked={extension.enabled}
          onCheckedChange={handleToggle}
          disabled={isPending}
          aria-label={`Toggle ${extension.name}`}
        />
      </div>

      <div className="flex flex-1 flex-col p-3 pt-9 sm:p-4 sm:pt-10">
        <div className="flex gap-3 pr-12 sm:gap-4">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent-fill/12 text-lg font-bold text-accent-text">
            {extension.name.slice(0, 2).toUpperCase()}
          </div>

          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-zinc-100">
              {extension.name}
            </h3>
            <p className="mt-1 text-xs leading-5 text-zinc-400">
              {extension.description}
            </p>
          </div>
        </div>
      </div>

      <div className="px-3 pb-1 sm:px-4">
        <div className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 font-mono text-[10px] text-zinc-500">
          <span>v{extension.version}</span>
          <span className="size-1 shrink-0 rounded-full bg-accent-fill/80" />
          <span>
            {extension.settingsCount ? `${extension.settingsCount} settings` : "no settings"}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-white/5 p-2.5 sm:p-3">
        {primaryAction && (
          <Button
            variant="ghost"
            className="h-8 flex-1 justify-start gap-1.5 rounded-lg border border-accent-fill/40 bg-accent-fill/10 px-2.5 text-[11px] text-accent-text hover:bg-accent-fill/15 hover:text-accent-text"
            onClick={(e) => {
              e.stopPropagation();
              handlePrimaryAction();
            }}
          >
            <ArrowUpRight className="size-3 shrink-0" />
            <span className="truncate">{primaryAction.label}</span>
          </Button>
        )}

        {!primaryAction && <div className="flex-1" />}

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
      </div>
    </div>
  );
}

function ExtensionCardSkeleton() {
  return (
    <div className="relative flex min-h-64 flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] sm:min-h-72 xl:min-h-80">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,color-mix(in_oklab,var(--primary)_8%,transparent),transparent_48%)]" />
      <div className="absolute right-3 top-3 h-6 w-11 animate-pulse rounded-full bg-white/5" />
      <div className="flex flex-1 flex-col p-3 pt-9">
        <div className="flex gap-3 pr-12 sm:gap-4">
          <div className="size-11 animate-pulse rounded-xl bg-white/5" />
          <div className="flex-1 space-y-1.5 pt-0.5">
            <div className="h-4 w-20 animate-pulse rounded bg-white/5" />
            <div className="space-y-1">
              <div className="h-2.5 w-full animate-pulse rounded bg-white/5" />
              <div className="h-2.5 w-2/3 animate-pulse rounded bg-white/5" />
            </div>
          </div>
        </div>
      </div>
      <div className="px-3 pb-1">
        <div className="h-5 w-36 max-w-full animate-pulse rounded-full bg-white/5" />
      </div>
      <div className="flex items-center gap-2 border-t border-white/5 p-2.5">
        <div className="h-8 flex-1 animate-pulse rounded-lg bg-white/5" />
        <div className="size-8 animate-pulse rounded-lg bg-white/5" />
      </div>
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
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,17rem),1fr))] gap-3 xl:grid-cols-[repeat(auto-fit,minmax(19rem,1fr))]">
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
