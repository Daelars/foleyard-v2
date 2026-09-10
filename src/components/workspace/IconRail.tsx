"use client";

import { Layers, Library, ListMusic, Settings, Shapes, Star, Tags } from "lucide-react";

import { cn } from "@/lib/utils";

export type RailView = "library" | "favorites" | "shelf" | "extensions" | "organize" | "auto-tag";

export function IconRail({
  activeView,
  favoritesCount,
  shelfCount,
  onSelectLibrary,
  onSelectFavorites,
  onSelectShelf,
  onSelectExtensions,
  onSelectOrganize,
  onSelectAutoTag,
  showAutoTag = false,
  onOpenSettings,
  settingsActive = false,
  className,
}: {
  activeView: RailView | null;
  favoritesCount: number;
  shelfCount: number;
  onSelectLibrary: () => void;
  onSelectFavorites: () => void;
  onSelectShelf: () => void;
  onSelectExtensions: () => void;
  onSelectOrganize: () => void;
  onSelectAutoTag?: () => void;
  showAutoTag?: boolean;
  onOpenSettings: () => void;
  settingsActive?: boolean;
  className?: string;
}) {
  const railButtonClass = (active: boolean) =>
    cn(
      "relative flex w-fit min-w-16 flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-[10px] font-semibold uppercase tracking-widest outline-none",
      "transition-[background-color,border-color,box-shadow,color,transform] duration-150 motion-reduce:transition-none",
      "motion-safe:hover:-translate-y-px motion-safe:active:scale-[0.96]",
      "focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
      active
        ? "border-edge-accent-soft bg-[color-mix(in_oklab,var(--accent-fill)_15%,transparent)] text-accent-text shadow-[0_0_18px_color-mix(in_oklab,var(--accent-fill)_16%,transparent)]"
        : "border-transparent text-zinc-500 hover:border-edge hover:bg-white/[0.04] hover:text-zinc-200",
    );

  const badge = (count: number) =>
    count > 0 ? (
      <span className="absolute right-1.5 top-1.5 rounded-full bg-accent-fill px-1 font-mono text-[9px] font-bold leading-tight text-white">
        {count}
      </span>
    ) : null;

  const items: Array<{
    id: string;
    label: string;
    icon: React.ReactNode;
    badge?: number;
    active: boolean;
    onSelect: () => void;
  }> = [
    {
      id: "library",
      label: "Library",
      icon: <Library className="size-5" />,
      active: activeView === "library",
      onSelect: onSelectLibrary,
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
      id: "organize",
      label: "Organize",
      icon: <Shapes className="size-5" />,
      active: activeView === "organize",
      onSelect: onSelectOrganize,
    },
    ...(showAutoTag && onSelectAutoTag
      ? [
          {
            id: "auto-tag",
            label: "Auto tag",
            icon: <Tags className="size-5" />,
            active: activeView === "auto-tag",
            onSelect: onSelectAutoTag,
          },
        ]
      : []),
    {
      id: "extensions",
      label: "Extensions",
      icon: <Layers className="size-5" />,
      active: activeView === "extensions",
      onSelect: onSelectExtensions,
    },
  ];

  return (
    <nav
      aria-label="Primary"
      className={cn(
        "relative flex w-fit min-w-20 shrink-0 flex-col items-center gap-1 px-3 py-4",
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
          "mt-auto",
          railButtonClass(settingsActive),
        )}
      >
        <Settings className="size-5" />
        Settings
      </button>
    </nav>
  );
}
