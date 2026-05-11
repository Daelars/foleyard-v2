"use client";

import { useCallback, useState } from "react";
import { ArrowUpRight, MoreHorizontal } from "lucide-react";

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
  commands?: string[];
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
    "rename-hammer": {
      label: "Rename files",
      command: "rename-hammer.open",
    },
    "drop-rules": {
      label: "Configure rules",
      command: "drop-rules.prepare-drag",
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
    <div className="relative flex min-h-64 flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/80 shadow-md sm:min-h-72 xl:min-h-80">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,color-mix(in_oklab,var(--primary)_8%,transparent),transparent_48%)]" />
      <div className="absolute right-3 top-3 z-10">
        <Switch
          checked={extension.enabled}
          onCheckedChange={handleToggle}
          disabled={isPending}
        />
      </div>

      <div className="flex flex-1 flex-col p-3 pt-9 sm:p-4 sm:pt-10">
        <div className="flex gap-3 pr-12 sm:gap-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-muted/50 text-xs font-bold text-primary shadow-inner">
            {extension.name.slice(0, 2).toUpperCase()}
          </div>

          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">
              {extension.name}
            </h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {extension.description}
            </p>
          </div>
        </div>
      </div>

      <div className="px-3 pb-1 sm:px-4">
        <div className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border/60 bg-muted/30 px-2.5 py-0.5 text-[10px] text-muted-foreground">
          <span>v{extension.version}</span>
          <span className="size-1 shrink-0 rounded-full bg-primary/80" />
          <span>
            {extension.provider === "foleyard" ? "Foleyard" : extension.provider}
          </span>
          <span className="size-1 shrink-0 rounded-full bg-primary/80" />
          <span>{extension.category}</span>
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-border/60 p-2.5 sm:p-3">
        {primaryAction && (
          <Button
            variant="ghost"
            className="h-8 flex-1 justify-start gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-2.5 text-[11px] text-primary hover:bg-primary/15 hover:text-primary"
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
          className="size-8 shrink-0 rounded-lg border border-border/70 bg-muted/30 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation();
            onOpenDetails?.(extension);
          }}
        >
          <span className="sr-only">Details and settings</span>
          <MoreHorizontal className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

function ExtensionCardSkeleton() {
  return (
    <div className="relative flex min-h-64 flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/80 shadow-md sm:min-h-72 xl:min-h-80">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,color-mix(in_oklab,var(--primary)_8%,transparent),transparent_48%)]" />
      <div className="absolute right-3 top-3 h-4 w-7 animate-pulse rounded-full bg-muted/50" />
      <div className="flex flex-1 flex-col p-3 pt-9">
        <div className="flex gap-3 pr-12 sm:gap-4">
          <div className="size-10 animate-pulse rounded-xl bg-muted/50 shadow-inner" />
          <div className="flex-1 space-y-1.5 pt-0.5">
            <div className="h-4 w-20 animate-pulse rounded bg-muted/50" />
            <div className="space-y-1">
              <div className="h-2.5 w-full animate-pulse rounded bg-muted/50" />
              <div className="h-2.5 w-2/3 animate-pulse rounded bg-muted/50" />
            </div>
          </div>
        </div>
      </div>
      <div className="px-3 pb-1">
        <div className="h-5 w-36 max-w-full animate-pulse rounded-full bg-muted/50" />
      </div>
      <div className="flex items-center gap-2 border-t border-border/60 p-2.5">
        <div className="h-8 flex-1 animate-pulse rounded-lg bg-muted/50" />
        <div className="size-8 animate-pulse rounded-lg bg-muted/50" />
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

  const handleGridMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      setMouse({
        x: ((e.clientX - rect.left) / rect.width) * 100,
        y: ((e.clientY - rect.top) / rect.height) * 100,
      });
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
        <div className="flex min-h-64 flex-1 items-center justify-center rounded-2xl border border-dashed border-border/40 bg-card/60 px-6 text-center shadow-sm backdrop-blur-xl">
          <div className="max-w-md space-y-2">
            <p className="text-sm font-medium">No extensions registered</p>
            <p className="text-sm text-muted-foreground">
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
