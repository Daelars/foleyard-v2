import Link from "next/link";

type PrototypeLink = {
  route: string;
  title: string;
  blurb: string;
  variants?: { key: string; name: string }[];
};

const PROTOTYPES: PrototypeLink[] = [
  {
    route: "/prototype/component-library",
    title: "Component library",
    blurb:
      "Control language specimens back to back: shipped shadcn geometry vs. console wells vs. mockup match vs. house style and follow-ups. Contains the Variant I reference the new surface was built from.",
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
    route: "/prototype/variant-i-library",
    title: "Variant I library",
    blurb:
      "The Variant I specimen rebuilt from the extracted library alone. The living styleguide and validation aid for src/components/variant-i.",
  },
  {
    route: "/prototype/ext-v2-workbench",
    title: "Ext v2 workbench",
    blurb:
      "v2 development workbench: contributions through the production adapters, sanitized catalog inspection, fixture commands, and job outcomes with reload.",
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
          The surviving prototype routes under{" "}
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
