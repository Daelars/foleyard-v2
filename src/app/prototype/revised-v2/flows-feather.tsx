"use client";

import { DEMO_COLLECTIONS, DEMO_TAGS, VariantFrame } from "../showcase/data";
import { FlowA, FlowB, FlowC, useFlowState } from "./flows";
import { Swatches } from "./shared";

const FEATHER_MASK = {
  WebkitMaskImage: "radial-gradient(100% 100% at 50% 50%, black 38%, transparent 98%)",
  maskImage: "radial-gradient(100% 100% at 50% 50%, black 38%, transparent 98%)",
} as const;

function FeatherBed({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl border border-white/10 p-3 backdrop-blur-md sm:p-4"
      style={{ ...FEATHER_MASK, backgroundColor: "rgba(0,0,0,0.72)" }}
    >
      {children}
    </div>
  );
}

function DemoLabel({ code, name }: { code: string; name: string }) {
  return (
    <p className="mb-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
      <span className="font-bold text-accent-text">{code}</span> · {name}
    </p>
  );
}

function selectionColor(shared: ReturnType<typeof useFlowState>): string {
  const { selection, collectionColors, tagColors } = shared;
  if (selection.kind === "collection") {
    const fallback = DEMO_COLLECTIONS.find((c) => c.id === selection.id)?.color ?? "#f0503c";
    return collectionColors[selection.id] ?? fallback;
  }
  const fallback = DEMO_TAGS.find((t) => t.id === selection.id)?.color ?? "#f0503c";
  return tagColors[selection.id] ?? fallback;
}

export function FeatherFlows() {
  const shared = useFlowState();
  const color = selectionColor(shared);
  const wash: React.CSSProperties = {
    backgroundColor: `${color}0a`,
    backgroundImage: `radial-gradient(circle at 12% 0%, ${color}45, transparent 92%)`,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-600">
          Preview color
        </span>
        <Swatches
          value={color}
          onPick={(next) => {
            if (shared.selection.kind === "collection") {
              shared.setCollectionColors((prev) => ({ ...prev, [shared.selection.id]: next }));
            } else {
              shared.setTagColors((prev) => ({ ...prev, [shared.selection.id]: next }));
            }
          }}
        />
        <span className="font-mono text-[10px] text-zinc-600">
          {shared.selection.kind}: {shared.selection.id} · all three flows follow
        </span>
      </div>

      <div className="space-y-6">
        <div>
          <DemoLabel code="A" name="Rows → detail, entire flow in full feather" />
          <div className="rounded-2xl border border-white/10 p-2 sm:p-3" style={wash}>
            <FeatherBed>
              <FlowA {...shared} />
            </FeatherBed>
          </div>
        </div>

        <div>
          <DemoLabel code="B" name="Tiles → sheet, entire flow in full feather" />
          <div className="rounded-2xl border border-white/10 p-2 sm:p-3" style={wash}>
            <FeatherBed>
              <FlowB {...shared} />
            </FeatherBed>
          </div>
        </div>

        <div>
          <DemoLabel code="C" name="Split browser, entire flow in full feather" />
          <div className="rounded-2xl border border-white/10 p-2 sm:p-3" style={wash}>
            <FeatherBed>
              <FlowC {...shared} />
            </FeatherBed>
          </div>
        </div>
      </div>
    </div>
  );
}

export function FeatherFlowsFrame() {
  return (
    <VariantFrame
      id="W-G"
      name="Full feather × entire flows"
      note="The complete W-A / W-B / W-C flows sharing one color state, each inside the full feather."
    >
      <FeatherFlows />
    </VariantFrame>
  );
}
