"use client";

import { useEffect, useState } from "react";
import {
  Folder,
  Layers,
  Library,
  ListMusic,
  Settings,
  Star,
  Tags,
} from "lucide-react";

import { cn } from "@/lib/utils";

export type RailView = "library" | "favorites" | "shelf" | "extensions";

export type RailCollection = {
  id: string;
  name: string;
  fileCount?: number;
};

export type RailTag = {
  id: string;
  name: string;
  color: string;
};

type Flyout = "collections" | "tags" | null;

function FlyoutRow({
  active,
  onClick,
  label,
  meta,
}: {
  active: boolean;
  onClick: () => void;
  label: React.ReactNode;
  meta?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors",
        active
          ? "border-accent-fill/50 bg-accent-fill/15 font-semibold text-accent-text"
          : "border-transparent font-medium text-zinc-400 hover:bg-white/5 hover:text-zinc-200",
      )}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {meta}
    </button>
  );
}

export function IconRail({
  activeView,
  favoritesCount,
  shelfCount,
  onSelectLibrary,
  onSelectFavorites,
  onSelectShelf,
  onSelectExtensions,
  onOpenSettings,
  settingsActive = false,
  collections = [],
  tags = [],
  selectedCollection = null,
  selectedTagId = null,
  onSelectCollection,
  onSelectTag,
  className,
}: {
  activeView: RailView | null;
  favoritesCount: number;
  shelfCount: number;
  onSelectLibrary: () => void;
  onSelectFavorites: () => void;
  onSelectShelf: () => void;
  onSelectExtensions: () => void;
  onOpenSettings: () => void;
  settingsActive?: boolean;
  collections?: RailCollection[];
  tags?: RailTag[];
  selectedCollection?: string | null;
  selectedTagId?: string | null;
  onSelectCollection?: (id: string | null) => void;
  onSelectTag?: (id: string | null) => void;
  className?: string;
}) {
  const [flyout, setFlyout] = useState<Flyout>(null);

  useEffect(() => {
    if (!flyout) {
      return;
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setFlyout(null);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flyout]);

  const toggleFlyout = (next: Exclude<Flyout, null>) => {
    setFlyout((current) => (current === next ? null : next));
  };

  const pickCollection = (id: string | null) => {
    onSelectCollection?.(id);
    setFlyout(null);
  };

  const pickTag = (id: string | null) => {
    onSelectTag?.(id);
    setFlyout(null);
  };

  const railButtonClass = (active: boolean) =>
    cn(
      "relative flex w-16 flex-col items-center gap-1 rounded-xl border px-1 py-2.5 text-[10px] font-semibold uppercase tracking-widest transition-all",
      active
        ? "border-accent-fill/50 bg-accent-fill/15 text-accent-text shadow-glow-accent"
        : "border-transparent text-zinc-500 hover:border-white/10 hover:bg-white/5 hover:text-zinc-200",
    );

  const badge = (count: number) =>
    count > 0 ? (
      <span className="absolute right-1.5 top-1.5 rounded-full bg-accent-fill px-1 font-mono text-[9px] font-bold text-white">
        {count}
      </span>
    ) : null;

  const items: Array<{
    id: string;
    label: string;
    icon: React.ReactNode;
    badge?: number;
    active: boolean;
    expanded?: boolean;
    onSelect: () => void;
  }> = [
    {
      id: "library",
      label: "Library",
      icon: <Library className="size-5" />,
      active: activeView === "library",
      expanded: false,
      onSelect: onSelectLibrary,
    },
    {
      id: "collections",
      label: "Collections",
      icon: <Folder className="size-5" />,
      badge: collections.length,
      active: selectedCollection !== null,
      expanded: flyout === "collections",
      onSelect: () => toggleFlyout("collections"),
    },
    {
      id: "tags",
      label: "Tags",
      icon: <Tags className="size-5" />,
      badge: tags.length,
      active: selectedTagId !== null,
      expanded: flyout === "tags",
      onSelect: () => toggleFlyout("tags"),
    },
    {
      id: "favorites",
      label: "Favorites",
      icon: <Star className="size-5" />,
      badge: favoritesCount,
      active: activeView === "favorites",
      onSelect: onSelectFavorites,
    },
    {
      id: "shelf",
      label: "Shelf",
      icon: <ListMusic className="size-5" />,
      badge: shelfCount,
      active: activeView === "shelf",
      onSelect: onSelectShelf,
    },
    {
      id: "extensions",
      label: "Extensions",
      icon: <Layers className="size-5" />,
      active: activeView === "extensions",
      expanded: false,
      onSelect: onSelectExtensions,
    },
  ];

  return (
    <nav
      aria-label="Primary"
      className={cn(
        "relative flex w-20 shrink-0 flex-col items-center gap-1 border-r border-white/10 py-4",
        className,
      )}
    >
      <div className="mb-4 flex size-10 items-center justify-center rounded-xl bg-accent-fill text-lg font-black text-white shadow-glow-accent-strong">
        F
      </div>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={item.onSelect}
          aria-label={item.label}
          aria-current={item.active ? "page" : undefined}
          aria-expanded={item.expanded || undefined}
          className={railButtonClass(item.active)}
        >
          {item.icon}
          {item.label}
          {typeof item.badge === "number" ? badge(item.badge) : null}
        </button>
      ))}
      <button
        type="button"
        onClick={onOpenSettings}
        aria-label="Settings"
        className={cn(
          "mt-auto flex w-16 flex-col items-center gap-1 rounded-xl border px-1 py-2.5 text-[10px] font-semibold uppercase tracking-widest transition-all",
          settingsActive
            ? "border-accent-fill/50 bg-accent-fill/15 text-accent-text"
            : "border-transparent text-zinc-500 hover:border-white/10 hover:bg-white/5 hover:text-zinc-200",
        )}
      >
        <Settings className="size-5" />
        Settings
      </button>

      {flyout ? (
        <button
          type="button"
          aria-label="Close browse panel"
          onClick={() => setFlyout(null)}
          className="fixed inset-0 z-40 cursor-default bg-transparent"
        />
      ) : null}

      {flyout === "collections" ? (
        <div
          role="dialog"
          aria-label="Browse collections"
          className="absolute bottom-4 left-[5.5rem] top-4 z-50 flex w-60 flex-col overflow-hidden rounded-2xl border border-white/10 bg-shell/95 backdrop-blur-2xl"
        >
          <p className="px-3 pb-1 pt-3 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
            Collections
          </p>
          <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2 pt-1">
            <FlyoutRow
              active={!selectedCollection}
              onClick={() => pickCollection(null)}
              label="All collections"
            />
            {collections.map((collection) => (
              <FlyoutRow
                key={collection.id}
                active={selectedCollection === collection.id}
                onClick={() => pickCollection(collection.id)}
                label={collection.name}
                meta={
                  typeof collection.fileCount === "number" ? (
                    <span className="shrink-0 font-mono text-[10px] tabular-nums text-zinc-600">
                      {collection.fileCount}
                    </span>
                  ) : undefined
                }
              />
            ))}
          </div>
        </div>
      ) : null}

      {flyout === "tags" ? (
        <div
          role="dialog"
          aria-label="Browse tags"
          className="absolute bottom-4 left-[5.5rem] top-4 z-50 flex w-60 flex-col overflow-hidden rounded-2xl border border-white/10 bg-shell/95 backdrop-blur-2xl"
        >
          <p className="px-3 pb-1 pt-3 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
            Tags
          </p>
          <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2 pt-1">
            <FlyoutRow
              active={!selectedTagId}
              onClick={() => pickTag(null)}
              label="All tags"
            />
            {tags.map((tag) => (
              <FlyoutRow
                key={tag.id}
                active={selectedTagId === tag.id}
                onClick={() => pickTag(tag.id)}
                label={
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: tag.color }}
                    />
                    <span className="truncate">{tag.name}</span>
                  </span>
                }
              />
            ))}
          </div>
        </div>
      ) : null}
    </nav>
  );
}
