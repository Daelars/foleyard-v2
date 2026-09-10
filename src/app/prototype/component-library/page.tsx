// PROTOTYPE ONLY — throwaway `/prototype/component-library` route.
//
// Question: should Foleyard's controls keep the shipped shadcn geometry with
// Foleyard colours (A), be rebuilt as machined wells and keys (B), match the
// reference mockup (D), or finish the app's own existing language (E)?
//
// Variants of specimen content, switchable via `?variant=`.
// A renders the real shared components from `src/components/ui`. B, D, and E
// render local throwaway kits so A stays untouched and all can be seen back to
// back. E additionally mounts inside the production IconRail and
// AudioPlayerShell, since controls only misfit when seen against real chrome.
// Settings and scan state live here so flipping variants preserves what you
// set and the comparison is like for like.
"use client";

import { Suspense, useState } from "react";

import { PrototypeSwitcher, usePrototypeVariant } from "@/components/PrototypeSwitcher";

import { SPECIMEN_SETTINGS } from "./fixtures";
import { VariantA } from "./variant-a";
import { VariantB } from "./variant-b";
import { VariantD } from "./variant-d";
import { VariantE } from "./variant-e";
import { VariantF } from "./variant-f";
import { VariantG } from "./variant-g";
import { VariantH } from "./variant-h";
import { VariantI } from "./variant-i";
import { VariantJ } from "./variant-j";

// Slot C is intentionally free. A concurrent session's "Glassy (tinted
// acrylic)" variant C was overwritten and is not recoverable; rebuild it here
// as ./variant-c and re-add its entry below when you do.
const VARIANTS = [
  { key: "A", name: "Shipped (shadcn geometry)" },
  { key: "B", name: "Console (wells and keys)" },
  { key: "D", name: "Mockup match" },
  { key: "E", name: "House style (in real chrome)" },
  { key: "F", name: "D grid, E palette" },
  { key: "G", name: "F in motion" },
  { key: "H", name: "G plus the rest" },
  { key: "I", name: "H plus leftovers" },
  { key: "J", name: "App, new parts" },
];

export type SpecimenState = {
  settings: Record<string, boolean>;
  onToggleSetting: (key: string) => void;
  scanRunning: boolean;
  onToggleScan: () => void;
};

const INITIAL_SETTINGS: Record<string, boolean> = Object.fromEntries(
  SPECIMEN_SETTINGS.map((setting) => [setting.key, setting.key !== "janitor"]),
);

function ComponentLibraryContent() {
  const current = usePrototypeVariant(VARIANTS);
  const [settings, setSettings] = useState(INITIAL_SETTINGS);
  const [scanRunning, setScanRunning] = useState(false);

  const state: SpecimenState = {
    settings,
    onToggleSetting: (key) => setSettings((prev) => ({ ...prev, [key]: !prev[key] })),
    scanRunning,
    onToggleScan: () => setScanRunning((running) => !running),
  };

  return (
    <main className="min-h-full overflow-y-auto bg-canvas text-zinc-100">
      <p className="border-b border-white/10 bg-black/40 px-4 py-1.5 text-center font-mono text-[11px] text-accent-text">
        PROTOTYPE — throwaway component specimens on fake data. Nothing here changes the app.
      </p>

      {current === "A" ? (
        <VariantA {...state} />
      ) : current === "D" ? (
        <VariantD {...state} />
      ) : current === "E" ? (
        <VariantE {...state} />
      ) : current === "F" ? (
        <VariantF {...state} />
      ) : current === "G" ? (
        <VariantG {...state} />
      ) : current === "H" ? (
        <VariantH {...state} />
      ) : current === "I" ? (
        <VariantI {...state} />
      ) : current === "J" ? (
        <VariantJ {...state} />
      ) : (
        <VariantB {...state} />
      )}

      <PrototypeSwitcher variants={VARIANTS} current={current} />
    </main>
  );
}

export default function ComponentLibraryPage() {
  return (
    <Suspense>
      <ComponentLibraryContent />
    </Suspense>
  );
}
