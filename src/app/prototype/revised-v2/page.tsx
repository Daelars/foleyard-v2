import { SectionShell } from "../showcase/data";
import { ConsoleV2 } from "./console-v2";
import { OrganizeFlows } from "./flows";
import { PaletteV2 } from "./palette-v2";
import { PopupsV2 } from "./popups-v2";

export default function RevisedV2Page() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-canvas pb-20 font-sans text-zinc-100 antialiased">
      <p className="border-b border-white/10 bg-black/40 px-4 py-1.5 text-center font-mono text-[11px] text-accent-text">
        REVISED DESIGNS V2 — throwaway review round. Nothing here ships until picked.
      </p>
      <div className="mx-auto w-full max-w-5xl px-4 pt-8 md:px-6">
        <h1 className="text-5xl font-extrabold tracking-tighter text-zinc-50">
          Revised designs v2
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm font-medium text-zinc-400">
          Everything demoed in context this time: backdrops, glow, and
          transparency read honestly. Reply with picks, e.g. “palette as-is,
          popups as-is, console rounded, flow W-A”.
        </p>
      </div>

      <div className="mt-8 space-y-14">
        <SectionShell
          index="V2-01"
          title="Palette, revised quiet"
          question="Glow, transparency, and gradient backdrop — does it sit in the app now?"
        >
          <PaletteV2 />
        </SectionShell>

        <SectionShell
          index="V2-02"
          title="Popups, quiet language"
          question="Same recipe as the revised palette across menus and confirms?"
        >
          <PopupsV2 />
        </SectionShell>

        <SectionShell
          index="V2-03"
          title="Console, fully rounded"
          question="T-F redrawn as one capsule with every control aboard?"
        >
          <ConsoleV2 />
        </SectionShell>

        <SectionShell
          index="V2-04"
          title="Organize flows"
          question="Three full browse → select → recolor flows. Selection wears the chosen color."
        >
          <OrganizeFlows />
        </SectionShell>
      </div>
    </div>
  );
}
