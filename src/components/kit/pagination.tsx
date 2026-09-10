"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"

// New shared component, built to variant I: 32px square keys at rounded-md
// with mono numerals, where the current page takes the same accent edge,
// tint and glow as the active palette row and the selected tag. Numbers are
// data, so they are mono and tabular and the row does not reflow as the
// count changes.

function PageButton({
  active = false,
  label,
  disabled,
  onClick,
  children,
}: {
  active?: boolean
  label: string
  disabled?: boolean
  onClick?: () => void
  children?: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-current={active || undefined}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-md border font-mono text-xs tabular-nums",
        "transition-colors duration-150 motion-reduce:transition-none",
        "outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
        "disabled:pointer-events-none disabled:border-edge disabled:text-zinc-600",
        active
          ? "border-edge-accent bg-[color-mix(in_oklab,var(--accent-fill)_14%,transparent)] text-accent-text shadow-[0_0_14px_color-mix(in_oklab,var(--accent-fill)_12%,transparent)]"
          : "border-edge bg-white/[0.02] text-zinc-400 hover:border-edge-hover hover:text-zinc-100",
        "[&_svg]:size-3.5"
      )}
    >
      {children ?? label}
    </button>
  )
}

function Pagination({
  page,
  pageCount,
  onPageChange,
  className,
}: {
  page: number
  pageCount: number
  onPageChange: (page: number) => void
  className?: string
}) {
  return (
    <nav aria-label="Pagination" className={cn("flex items-center gap-1.5", className)}>
      <PageButton label="Previous page" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
        <ChevronLeft />
      </PageButton>
      <span className="px-1 font-mono text-xs tabular-nums text-zinc-500">
        {page} / {pageCount}
      </span>
      <PageButton label="Next page" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>
        <ChevronRight />
      </PageButton>
    </nav>
  )
}

export { Pagination, PageButton }
