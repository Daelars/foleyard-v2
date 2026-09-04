"use client";

import { Layers, Library, ListMusic, Settings, Shapes, Star } from "lucide-react";

import { cn } from "@/lib/utils";

export type RailView = "library" | "favorites" | "shelf" | "extensions" | "organize";

export function IconRail({
  activeView,
  favoritesCount,
  shelfCount,
  onSelectLibrary,
  onSelectFavorites,
  onSelectShelf,
  onSelectExtensions,
  onSelectOrganize,
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
  onOpenSettings: () => void;
  settingsActive?: boolean;
  className?: string;
}) {
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
    </nav>
  );
}
