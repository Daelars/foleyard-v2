"use client";

// PROTOTYPE ONLY — floating variant switcher for throwaway /prototype routes.
// Hidden in production builds. Delete along with the prototype it serves.

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

export type PrototypeVariant = {
  key: string;
  name: string;
};

export function usePrototypeVariant(variants: PrototypeVariant[]) {
  const searchParams = useSearchParams();
  const requested = searchParams.get("variant");
  return variants.some((variant) => variant.key === requested)
    ? (requested as string)
    : variants[0].key;
}

export function PrototypeSwitcher({
  variants,
  current,
}: {
  variants: PrototypeVariant[];
  current: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const index = Math.max(
    0,
    variants.findIndex((variant) => variant.key === current),
  );
  const active = variants[index];

  const go = (delta: number) => {
    const next = variants[(index + delta + variants.length) % variants.length];
    const params = new URLSearchParams(searchParams.toString());
    params.set("variant", next.key);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;

      const target = event.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable
      ) {
        return;
      }

      event.preventDefault();
      go(event.key === "ArrowLeft" ? -1 : 1);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  if (process.env.NODE_ENV === "production") return null;

  return (
    <div className="fixed bottom-5 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/20 bg-zinc-950/95 p-1 shadow-2xl shadow-black/60 backdrop-blur">
      <button
        type="button"
        onClick={() => go(-1)}
        aria-label="Previous variant"
        className="grid size-8 place-items-center rounded-full text-zinc-400 transition-colors hover:bg-white/10 hover:text-white active:scale-95"
      >
        <ChevronLeft className="size-4" />
      </button>

      <div className="px-2 text-center">
        <div className="text-[11px] font-semibold tracking-tight text-white">
          <span className="text-accent-text">{active.key}</span>
          <span className="mx-1.5 text-zinc-600">—</span>
          {active.name}
        </div>
        <div className="text-[9px] uppercase tracking-widest text-zinc-600">
          prototype · ← →
        </div>
      </div>

      <button
        type="button"
        onClick={() => go(1)}
        aria-label="Next variant"
        className="grid size-8 place-items-center rounded-full text-zinc-400 transition-colors hover:bg-white/10 hover:text-white active:scale-95"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}
