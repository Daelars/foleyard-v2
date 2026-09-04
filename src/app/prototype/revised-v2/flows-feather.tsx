"use client";

import { useState } from "react";
import { ListMusic } from "lucide-react";

import { DEMO_COLLECTIONS, VariantFrame, tileStyle } from "../showcase/data";
import { Swatches } from "./shared";

const FEATHER_MASK = {
  WebkitMaskImage: "radial-gradient(100% 100% at 50% 50%, black 38%, transparent 98%)",
  maskImage: "radial-gradient(100% 100% at 50% 50%, black 38%, transparent 98%)",
} as const;

function MiniList({ color }: { color: string }) {
  return (
    <div className="space-y-1">
      {DEMO_COLLECTIONS.slice(0, 3).map((collection, i) => (
        <div
          key={collection.id}
          className={`flex items-center gap-2.5 rounded-xl border px-2.5 py-2 text-xs ${
            i === 1
              ? "border font-semibold text-zinc-100"
              : "border-transparent font-medium text-zinc-400"
          }`}
          style={i === 1 ? { borderColor: `${color}80`, backgroundColor: `${color}14` } : undefined}
        >
          <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
          <span className="min-w-0 flex-1 truncate">{collection.name}</span>
          <span className="shrink-0 font-mono text-[10px] tabular-nums text-zinc-600">
            {collection.fileCount}
          </span>
        </div>
      ))}
    </div>
  );
}

function MiniDetail({ color, files = 2 }: { color: string; files?: number }) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <span
          className="flex size-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold"
          style={tileStyle(color)}
        >
          Ra
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-zinc-100">Rain beds</p>
          <p className="mt-0.5 text-xs text-zinc-400">11 sounds · regular collection</p>
        </div>
        <span className="shrink-0 rounded-xl bg-accent-fill px-3 py-1.5 text-xs font-semibold text-white">
          Open
        </span>
      </div>
      <div className="mt-2 space-y-0.5">
        {["Metal Door Slam", "Glass Break Small"].slice(0, files).map((name) => (
          <div key={name} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-zinc-100">
            <ListMusic className="size-3.5 shrink-0 text-zinc-500" />
            <span className="truncate">{name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MiniTiles({ color }: { color: string }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {DEMO_COLLECTIONS.slice(0, 3).map((collection, i) => (
        <div key={collection.id}>
          <div
            className="flex h-16 items-end overflow-hidden rounded-xl border p-2"
            style={
              i === 1
                ? { borderColor: `${color}80`, background: `linear-gradient(135deg, ${color}30, ${color}0d)` }
                : { borderColor: "rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)" }
            }
          >
            <span className="text-base font-black tracking-tight" style={{ color: i === 1 ? color : "#71717a" }}>
              {collection.name.slice(0, 2).toUpperCase()}
            </span>
          </div>
          <p className="mt-1 truncate text-[11px] font-semibold text-zinc-200">{collection.name}</p>
        </div>
      ))}
    </div>
  );
}

function FeatherPanel({
  color,
  tinted = false,
  children,
}: {
  color: string;
  tinted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-2xl border border-white/10 p-3 backdrop-blur-md"
      style={{
        ...(FEATHER_MASK as React.CSSProperties),
        backgroundColor: tinted ? `${color}30` : "rgba(0,0,0,0.6)",
      }}
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

export function FeatherFlows() {
  const [color, setColor] = useState("#7ab8ff");
  const wash: React.CSSProperties = {
    backgroundColor: `${color}0a`,
    backgroundImage: `radial-gradient(circle at 12% 0%, ${color}38, transparent 75%)`,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-600">
          Preview color
        </span>
        <Swatches value={color} onPick={setColor} />
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-zinc-200">Rows → detail</p>
        <div className="grid gap-3 lg:grid-cols-3">
          <div>
            <DemoLabel code="A1" name="Unified feather" />
            <div className="rounded-2xl border border-white/10 p-2" style={wash}>
              <FeatherPanel color={color}>
                <MiniList color={color} />
                <div className="my-2 h-px bg-white/5" />
                <MiniDetail color={color} />
              </FeatherPanel>
            </div>
          </div>
          <div>
            <DemoLabel code="A2" name="Detail feather" />
            <div className="rounded-2xl border border-white/10 p-2" style={wash}>
              <MiniList color={color} />
              <div className="mt-2">
                <FeatherPanel color={color}>
                  <MiniDetail color={color} />
                </FeatherPanel>
              </div>
            </div>
          </div>
          <div>
            <DemoLabel code="A3" name="Tinted feather" />
            <div className="rounded-2xl border border-white/10 p-2" style={wash}>
              <FeatherPanel color={color} tinted>
                <MiniList color={color} />
                <div className="my-2 h-px bg-white/5" />
                <MiniDetail color={color} />
              </FeatherPanel>
            </div>
          </div>
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-zinc-200">Tiles → sheet</p>
        <div className="grid gap-3 lg:grid-cols-3">
          <div>
            <DemoLabel code="B1" name="Sheet feather" />
            <div className="rounded-2xl border border-white/10 p-2" style={wash}>
              <MiniTiles color={color} />
              <div className="mt-2">
                <FeatherPanel color={color}>
                  <MiniDetail color={color} />
                </FeatherPanel>
              </div>
            </div>
          </div>
          <div>
            <DemoLabel code="B2" name="Grid feather" />
            <div className="rounded-2xl border border-white/10 p-2" style={wash}>
              <FeatherPanel color={color}>
                <MiniTiles color={color} />
              </FeatherPanel>
              <div className="mt-2 px-1">
                <MiniDetail color={color} />
              </div>
            </div>
          </div>
          <div>
            <DemoLabel code="B3" name="Tinted sheet" />
            <div className="rounded-2xl border border-white/10 p-2" style={wash}>
              <MiniTiles color={color} />
              <div className="mt-2">
                <FeatherPanel color={color} tinted>
                  <MiniDetail color={color} />
                </FeatherPanel>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-zinc-200">Split browser</p>
        <div className="grid gap-3 lg:grid-cols-3">
          <div>
            <DemoLabel code="C1" name="Detail feather" />
            <div className="flex gap-2 rounded-2xl border border-white/10 p-2" style={wash}>
              <div className="w-2/5 shrink-0">
                <MiniList color={color} />
              </div>
              <div className="min-w-0 flex-1">
                <FeatherPanel color={color}>
                  <MiniDetail color={color} />
                </FeatherPanel>
              </div>
            </div>
          </div>
          <div>
            <DemoLabel code="C2" name="Browser feather" />
            <div className="flex gap-2 rounded-2xl border border-white/10 p-2" style={wash}>
              <div className="w-2/5 shrink-0">
                <FeatherPanel color={color}>
                  <MiniList color={color} />
                </FeatherPanel>
              </div>
              <div className="min-w-0 flex-1 px-1">
                <MiniDetail color={color} />
              </div>
            </div>
          </div>
          <div>
            <DemoLabel code="C3" name="Full feather" />
            <div className="rounded-2xl border border-white/10 p-2" style={wash}>
              <FeatherPanel color={color}>
                <div className="flex gap-2">
                  <div className="w-2/5 shrink-0">
                    <MiniList color={color} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <MiniDetail color={color} />
                  </div>
                </div>
              </FeatherPanel>
            </div>
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
      name="Full feather × flows"
      note="G1's treatment across all three flows, three placements each. One picker drives all nine."
    >
      <FeatherFlows />
    </VariantFrame>
  );
}
