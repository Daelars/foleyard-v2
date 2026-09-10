"use client";

import { useEffect } from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

/**
 * app-v3 toast host.
 *
 * The root layout already mounts the global Sonner Toaster and the
 * UpdateNotifier. While this route is mounted we set
 * `data-variant-i-toasts` on <body> (the root Toaster in
 * `src/components/ui/sonner.tsx` checks it and renders nothing), and mount
 * our own I-styled Toaster. Sonner's emitter is global, so every existing
 * app/hook notification (scan, favorites, bulk actions, update notifier…)
 * renders exactly once, with I's treatment. Leaving the route removes the
 * attribute and the original presentation resumes.
 */
export function VariantIToastHost({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.body.setAttribute("data-variant-i-toasts", "");
    return () => {
      document.body.removeAttribute("data-variant-i-toasts");
    };
  }, []);

  return (
    <>
      {children}
      <VariantIToaster />
    </>
  );
}

const TOAST_TONES: Record<string, { ring: string; icon: React.ReactNode }> = {
  success: {
    ring: "border-emerald-300/25",
    icon: (
      <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="size-3.5 text-emerald-300">
        <path d="M2.5 6.2 5 8.5 9.5 3.5" />
      </svg>
    ),
  },
  error: {
    ring: "border-[color-mix(in_oklab,var(--accent-fill)_45%,transparent)]",
    icon: (
      <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="size-3.5 text-accent-text">
        <path d="M3 3l6 6M9 3l-6 6" />
      </svg>
    ),
  },
  warning: {
    ring: "border-amber-300/25",
    icon: (
      <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="size-3.5 text-amber-300">
        <path d="M6 2.5 10.5 10h-9L6 2.5Z" />
        <path d="M6 5.5V7.5" />
        <path d="M6 8.8v.2" />
      </svg>
    ),
  },
  info: {
    ring: "border-[var(--vi-edge-hi)]",
    icon: (
      <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="size-3.5 text-zinc-300">
        <circle cx="6" cy="6" r="4.5" />
        <path d="M6 5.4V8" />
        <path d="M6 4v.2" />
      </svg>
    ),
  },
};

export function VariantIToaster(props: ToasterProps) {
  return (
    <Sonner
      theme="dark"
      className="vi-toast-host"
      closeButton
      toastOptions={{
        classNames: {
          toast: "!w-auto !border !bg-[#141419]/95 !rounded-lg !px-3 !py-2.5 !shadow-[0_12px_32px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.05)] !gap-2.5 !items-start",
          title: "!text-[13px] !font-medium !text-zinc-100",
          description: "!mt-0.5 !text-xs !leading-relaxed !text-zinc-500",
          actionButton: "!bg-transparent !border !border-[var(--vi-edge)] !text-accent-text !text-xs !h-8 !px-3 !rounded-lg",
          cancelButton: "!bg-transparent !text-zinc-400 !text-xs !h-8 !px-3",
          closeButton: "!bg-transparent !border-0 !text-zinc-600 hover:!text-zinc-200",
          icon: "!m-0",
        },
      }}
      icons={{
        success: TOAST_TONES.success.icon,
        error: TOAST_TONES.error.icon,
        warning: TOAST_TONES.warning.icon,
        info: TOAST_TONES.info.icon,
      }}
      style={
        {
          "--normal-bg": "#141419",
          "--normal-text": "#f4f4f5",
          "--normal-border": "rgba(255,255,255,0.16)",
          "--border-radius": "0.5rem",
          "--vi-edge": "rgba(255,255,255,0.09)",
          "--vi-edge-hi": "rgba(255,255,255,0.16)",
          "--vi-well": "rgba(0,0,0,0.42)",
          "--vi-lift": "inset 0 1px 0 rgba(255,255,255,0.05), 0 1px 2px rgba(0,0,0,0.4)",
          "--vi-sink": "inset 0 1px 3px rgba(0,0,0,0.55)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
}