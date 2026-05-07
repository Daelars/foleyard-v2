"use client";

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
};

type ExtensionGridProps = {
  extensions: ExtensionGridItem[];
  isLoading?: boolean;
  onToggleEnabled?: (extensionId: string, enabled: boolean) => void;
  onOpenDetails?: (extension: ExtensionGridItem) => void;
  pendingExtensionId?: string | null;
};

const skeletonCount = 6;

function ExtensionCard({
  extension,
  isPending,
  onOpenDetails,
  onToggleEnabled,
}: {
  extension: ExtensionGridItem;
  isPending: boolean;
  onOpenDetails?: (extension: ExtensionGridItem) => void;
  onToggleEnabled?: (extensionId: string, enabled: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border/50 bg-card/40 p-4 backdrop-blur-sm">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <span className="text-xs font-bold">
            {extension.name.slice(0, 2).toUpperCase()}
          </span>
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{extension.name}</p>
          <p className="text-xs text-muted-foreground">
            {extension.provider} · v{extension.version}
          </p>
        </div>
      </div>
      <p className="line-clamp-2 text-xs text-muted-foreground">
        {extension.description}
      </p>
      <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
        <span
          className={
            extension.enabled
              ? "rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-emerald-600"
              : "rounded-full border border-border/60 bg-background/50 px-2 py-1"
          }
        >
          {extension.enabled ? "enabled" : "disabled"}
        </span>
        <span className="rounded-full border border-border/60 bg-background/50 px-2 py-1">
          {extension.category}
        </span>
        {typeof extension.commandCount === "number" && (
          <span className="rounded-full border border-border/60 bg-background/50 px-2 py-1">
            {extension.commandCount} commands
          </span>
        )}
        {typeof extension.settingsCount === "number" && (
          <span className="rounded-full border border-border/60 bg-background/50 px-2 py-1">
            {extension.settingsCount} settings
          </span>
        )}
        {typeof extension.permissionCount === "number" && (
          <span className="rounded-full border border-border/60 bg-background/50 px-2 py-1">
            {extension.permissionCount} permissions
          </span>
        )}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          className="flex-1 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isPending}
          onClick={() => onToggleEnabled?.(extension.id, !extension.enabled)}
        >
          {isPending
            ? "Saving..."
            : extension.enabled
              ? "Disable"
              : "Enable"}
        </button>
        <button
          type="button"
          className="size-8 rounded-lg bg-muted/50 text-muted-foreground transition-colors hover:bg-muted"
          onClick={() => onOpenDetails?.(extension)}
        >
          <span className="sr-only">Details and settings</span>
          ⋯
        </button>
      </div>
    </div>
  );
}

function ExtensionCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border/50 bg-card/40 p-4 backdrop-blur-sm">
      <div className="flex items-start gap-3">
        <div className="size-10 animate-pulse rounded-lg bg-muted" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          <div className="h-3 w-16 animate-pulse rounded bg-muted" />
        </div>
      </div>
      <div className="space-y-2">
        <div className="h-3 w-full animate-pulse rounded bg-muted" />
        <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
      </div>
      <div className="flex gap-2">
        <div className="h-8 flex-1 animate-pulse rounded-lg bg-muted" />
        <div className="h-8 w-8 animate-pulse rounded-lg bg-muted" />
      </div>
    </div>
  );
}

export function ExtensionGrid({
  extensions = [],
  isLoading = false,
  onOpenDetails,
  onToggleEnabled,
  pendingExtensionId = null,
}: ExtensionGridProps) {
  const showEmptyState = !isLoading && extensions.length === 0;

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      {showEmptyState ? (
        <div className="flex min-h-64 items-center justify-center rounded-2xl border border-dashed border-border/60 bg-card/30 px-6 text-center backdrop-blur-sm">
          <div className="max-w-md space-y-2">
            <p className="text-sm font-medium">No extensions registered</p>
            <p className="text-sm text-muted-foreground">
              Installed local extensions appear here once they are registered
              with the Foleyard runtime.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                />
              ))}
        </div>
      )}
    </div>
  );
}
