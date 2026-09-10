import Link from "next/link";

type PrototypeLink = {
  route: string;
  title: string;
  blurb: string;
  variants?: { key: string; name: string }[];
};

const PROTOTYPES: PrototypeLink[] = [
  {
    route: "/prototype/blog",
    title: "Blog reading room",
    blurb:
      "All eight blog-posts development stories on one page: release train, filterable post cards, evidence lines, and what must not be claimed. Throwaway HTML map over blog-posts/.",
  },
  {
    route: "/prototype/showcase",
    title: "Design showcase",
    blurb:
      "Command palette, collections browser, palette, popups, console, and organize — several directions per element, all fake data. Pick a winner per element.",
  },
  {
    route: "/prototype/revised-v2",
    title: "Revised designs v2",
    blurb:
      "Second review round in context: revised palette, popups, console, and organize flows with backdrops and glow reading honestly.",
  },
  {
    route: "/prototype/app-v2",
    title: "App v2",
    blurb:
      "Full app mock: library, organize, favorites, shelf, and tools views with mock palette, console, and menus.",
  },
  {
    route: "/prototype/redesign",
    title: "Redesign",
    blurb:
      "Full-workspace redesign: studio-console layout, icon rail, command bar, inspector panel, and transport console.",
  },
  {
    route: "/prototype/component-library",
    title: "Component library",
    blurb:
      "Control language specimens back to back: shipped shadcn geometry vs. console wells vs. mockup match vs. house style and follow-ups.",
    variants: [
      { key: "A", name: "Shipped (shadcn geometry)" },
      { key: "B", name: "Console (wells and keys)" },
      { key: "D", name: "Mockup match" },
      { key: "E", name: "House style (in real chrome)" },
      { key: "F", name: "D grid, E palette" },
      { key: "G", name: "F in motion" },
      { key: "H", name: "G plus the rest" },
      { key: "I", name: "H plus leftovers" },
      { key: "J", name: "App, new parts" },
    ],
  },
  {
    route: "/prototype/auto-tag",
    title: "Auto-tag",
    blurb:
      "Three faces of the auto-tag v2 extension inside the real app chrome: rules engine, coverage board, and the real v2 sidebar panel.",
    variants: [
      { key: "A", name: "Rules engine" },
      { key: "B", name: "Coverage board" },
      { key: "C", name: "Real v2 sidebar panel" },
    ],
  },
  {
    route: "/prototype/auto-tag-board",
    title: "Auto-tag board",
    blurb:
      "The coverage board as a shipped-looking surface: no captions or counters in the chrome, just the board.",
    variants: [
      { key: "board", name: "Coverage board" },
      { key: "origins", name: "Tag origins" },
    ],
  },
  {
    route: "/prototype/auto-tag-fit",
    title: "Auto-tag fit",
    blurb:
      "What should the board's origin pills, queue chips, and run panels look like? The current UI annotated plus six structural fixes.",
    variants: [
      { key: "current", name: "Current — annotated findings" },
      { key: "system", name: "Quiet system" },
      { key: "passes", name: "Tagging passes" },
      { key: "command", name: "Command bar" },
      { key: "pinned", name: "Pinned bar under tabs" },
      { key: "minimal", name: "Minimal — collapsed queue, no origins tab" },
      { key: "compact", name: "Compact — one viewport" },
    ],
  },
  {
    route: "/prototype/code-investigation",
    title: "Code investigation",
    blurb:
      "Code-reduction audit readouts: every finding, ownership before/after, and work order. Evidence in docs/code-reduction-modularisation-audit.md.",
    variants: [
      { key: "A", name: "Ledger — every finding" },
      { key: "B", name: "Map — ownership before/after" },
      { key: "C", name: "Queue — work order" },
    ],
  },
  {
    route: "/prototype/extensions-diagram",
    title: "Extensions diagram",
    blurb: "How do extensions connect? One command top-to-bottom, a radial reach map, and a concrete trace plus matrix.",
    variants: [
      { key: "A", name: "Call path" },
      { key: "B", name: "Reach map" },
      { key: "C", name: "Inspector" },
    ],
  },
  {
    route: "/prototype/ext-v2-workbench",
    title: "Ext v2 workbench",
    blurb:
      "v2 development workbench: contributions through the production adapters, sanitized catalog inspection, fixture commands, and job outcomes with reload.",
  },
  {
    route: "/prototype/lib-adoption",
    title: "Library adoption",
    blurb:
      "Should Foleyard bring in zod, zustand, or arktype? Verdict board, surface map, and adoption ledger over the same findings.",
    variants: [
      { key: "A", name: "Verdict board" },
      { key: "B", name: "Surface map" },
      { key: "C", name: "Adoption ledger" },
    ],
  },
  {
    route: "/prototype/repo-audit",
    title: "Repo audit",
    blurb:
      "Can users understand partial scans and authorize a tool before it writes? Library workbench, operation timeline, and implementation desk.",
    variants: [
      { key: "A", name: "Library workbench" },
      { key: "B", name: "Operation timeline" },
      { key: "C", name: "Implementation desk" },
    ],
  },
  {
    route: "/prototype/legacy-app",
    title: "Legacy app (retired surface)",
    blurb:
      "The pre-variant-I workspace kept under the prototype gate for comparison while the new surface at / settles. Slated for deletion with the old component tree.",
  },
];

export default function PrototypeIndexPage() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-canvas pb-20 font-sans text-zinc-100 antialiased">
      <p className="border-b border-white/10 bg-black/40 px-4 py-1.5 text-center font-mono text-[11px] text-accent-text">
        PROTOTYPE — throwaway index. Read-only. Nothing here changes the app.
      </p>
      <div className="mx-auto w-full max-w-5xl px-4 pt-8 md:px-6">
        <h1 className="text-5xl font-extrabold tracking-tighter text-zinc-50">
          Prototypes
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm font-medium text-zinc-400">
          Every throwaway route under{" "}
          <code className="font-mono text-[12px] text-zinc-300">
            /prototype
          </code>
          . Dev only — these resolve to not-found in production builds.
        </p>

        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {PROTOTYPES.map((prototype) => (
            <li
              key={prototype.route}
              className="flex flex-col rounded-xl border border-white/10 bg-white/[0.03] p-5 transition-colors hover:border-white/25 hover:bg-white/[0.06]"
            >
              <Link
                href={prototype.route}
                className="text-lg font-bold tracking-tight text-zinc-50 underline-offset-4 hover:underline"
              >
                {prototype.title}
              </Link>
              <code className="mt-0.5 font-mono text-[11px] text-zinc-500">
                {prototype.route}
              </code>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-zinc-400">
                {prototype.blurb}
              </p>
              {prototype.variants ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {prototype.variants.map((variant) => (
                    <Link
                      key={variant.key}
                      href={`${prototype.route}?variant=${variant.key}`}
                      title={variant.name}
                      className="rounded-full border border-white/10 bg-black/40 px-2.5 py-1 font-mono text-[11px] text-zinc-300 transition-colors hover:border-white/30 hover:text-white"
                    >
                      {variant.key}
                    </Link>
                  ))}
                </div>
              ) : null}
            </li>
          ))}
        </ul>

        <p className="mt-8 text-xs text-zinc-500">
          Code-only, no route:{" "}
          <code className="font-mono text-[11px] text-zinc-400">
            arch-review
          </code>{" "}
          (proto-1 … proto-7 pipeline scripts, no page.tsx).
        </p>
      </div>
    </div>
  );
}
