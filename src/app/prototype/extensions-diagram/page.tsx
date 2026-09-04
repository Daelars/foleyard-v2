"use client";

// PROTOTYPE — throwaway. Three variants of an "how do extensions connect?"
// diagram, switchable via ?variant= on /prototype/extensions-diagram.
// Sub-shape B: an architecture diagram has no existing page to live inside.
//   A — Call path:  one command top-to-bottom, layers left, failure exits right.
//   B — Reach map:  radial graph, permissions as edges into Yard Core services.
//   C — Inspector:  no boxes; a real command's concrete trace plus a matrix.

import { Suspense } from "react";

import {
  PrototypeSwitcher,
  usePrototypeVariant,
  type PrototypeVariant,
} from "@/components/PrototypeSwitcher";

import { VariantPipeline } from "./variant-pipeline";
import { VariantHub } from "./variant-hub";
import { VariantTrace } from "./variant-trace";

const VARIANTS: PrototypeVariant[] = [
  { key: "A", name: "Call path" },
  { key: "B", name: "Reach map" },
  { key: "C", name: "Inspector" },
];

function Diagram() {
  const variant = usePrototypeVariant(VARIANTS);

  return (
    <>
      {variant === "A" && <VariantPipeline />}
      {variant === "B" && <VariantHub />}
      {variant === "C" && <VariantTrace />}
      <PrototypeSwitcher variants={VARIANTS} current={variant} />
    </>
  );
}

export default function ExtensionsDiagramPrototypePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0b0b10]" />}>
      <Diagram />
    </Suspense>
  );
}
