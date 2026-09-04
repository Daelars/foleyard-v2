import { ConsoleDesigns } from "./console-designs";
import { SectionShell } from "./data";
import { FlyoutDesigns } from "./flyout-designs";
import { OrganizeDesigns } from "./organize-designs";
import { PaletteDesigns } from "./palette-designs";
import { PopupDesigns } from "./popup-designs";
import { RowDesigns } from "./row-designs";

export default function ShowcasePage() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-canvas pb-20 font-sans text-zinc-100 antialiased">
      <p className="border-b border-white/10 bg-black/40 px-4 py-1.5 text-center font-mono text-[11px] text-accent-text">
        SHOWCASE — throwaway design review. Five directions per element, all fake data.
      </p>
      <div className="mx-auto w-full max-w-5xl px-4 pt-8 md:px-6">
        <h1 className="text-5xl font-extrabold tracking-tighter text-zinc-50">
          Design showcase
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm font-medium text-zinc-400">
          Four new elements, five designs each, plus the popup language,
          three more console takes, and the organize page. Interact where
          controls invite it, then pick a winner per element: reply like
          “palette F, popups B, console T-F, organize O-E”.
        </p>
      </div>

      <div className="mt-8 space-y-14">
        <SectionShell
          index="01"
          title="Command palette"
          question="Which dialog earns its place in the app: faithful, rich, split, quiet, or preview?"
        >
          <PaletteDesigns />
        </SectionShell>

        <SectionShell
          index="02"
          title="Collections / tags browser"
          question="Where should browsing live: overlay, inline column, menu, sheet, or filtered panel?"
        >
          <FlyoutDesigns />
        </SectionShell>

        <SectionShell
          index="03"
          title="Library rows"
          question="Density versus richness: grid, cards, compact, tiles, or grouped?"
        >
          <RowDesigns />
        </SectionShell>

        <SectionShell
          index="04"
          title="Transport console"
          question="How much player belongs in the footer: row, pill, split, mini, drawer — or the three new takes?"
        >
          <ConsoleDesigns />
        </SectionShell>

        <SectionShell
          index="05"
          title="Popup language"
          question="Menus, context menus, and confirms in the quiet palette language?"
        >
          <PopupDesigns />
        </SectionShell>

        <SectionShell
          index="06"
          title="Organize: collections & tags"
          question="One page for both, color-driven throughout. O-E is the exact color-picker proposal."
        >
          <OrganizeDesigns />
        </SectionShell>
      </div>
    </div>
  );
}
