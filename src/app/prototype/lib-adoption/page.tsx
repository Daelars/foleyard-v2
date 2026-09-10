"use client";

// THROWAWAY: three ways to read the same library-adoption review.
// Question: should foleyard bring in zod, zustand, or arktype? Where, why, and is it worth it?
// Existing /prototype convention is the host for this findings workbench, not the live app.
import { Suspense, useState } from "react";
import { Check, Minus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PrototypeSwitcher, usePrototypeVariant } from "@/components/PrototypeSwitcher";
import { libraries, surfaces, sequence, summary, type Verdict } from "./findings";

const variants = [
  { key: "A", name: "Verdict board" },
  { key: "B", name: "Surface map" },
  { key: "C", name: "Adoption ledger" },
];

const verdictStyle: Record<Verdict, { label: string; tone: string }> = {
  "adopt-selectively": { label: "Adopt · selective", tone: "text-emerald-400" },
  "adopt-targeted": { label: "Adopt · targeted", tone: "text-emerald-400" },
  hold: { label: "Hold", tone: "text-amber-400" },
};

function LibAdoption() {
  const variant = usePrototypeVariant(variants);
  const [openLib, setOpenLib] = useState<string>("zod");
  const [openSurface, setOpenSurface] = useState<string>("input-boundary");
  const [accepted, setAccepted] = useState<string[]>([]);

  const lib = libraries.find((item) => item.lib === openLib)!;
  const surface = surfaces.find((item) => item.id === openSurface)!;
  const toggleStep = (title: string) =>
    setAccepted((current) =>
      current.includes(title) ? current.filter((t) => t !== title) : [...current, title],
    );
  const reset = () => {
    setOpenLib("zod");
    setOpenSurface("input-boundary");
    setAccepted([]);
  };

  const state = {
    variant,
    focusedLibrary: openLib,
    focusedSurface: openSurface,
    acceptedSteps: accepted,
    verdicts: libraries.map((item) => ({ lib: item.lib, verdict: item.verdict })),
  };

  const verdictCard = (item: (typeof libraries)[number]) => (
    <button
      key={item.lib}
      type="button"
      onClick={() => setOpenLib(item.lib)}
      className={`rounded-xl border p-5 text-left transition-colors ${
        openLib === item.lib ? "border-primary bg-card" : "border-border bg-card/40 hover:bg-card"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-lg font-semibold">{item.lib}</span>
        <span className={`text-xs font-semibold ${verdictStyle[item.verdict].tone}`}>
          {verdictStyle[item.verdict].label}
        </span>
      </div>
      <p className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">{item.role}</p>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.oneLine}</p>
    </button>
  );

  const detail = (
    <article className="rounded-xl border border-border bg-card p-5" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="font-mono">{lib.lib}</Badge>
        <Badge variant="outline" className={verdictStyle[lib.verdict].tone}>
          {lib.verdictLabel}
        </Badge>
      </div>
      <p className="mt-4 text-sm leading-6">{lib.oneLine}</p>
      <h4 className="mt-5 text-sm font-semibold">Why</h4>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{lib.why}</p>
      <h4 className="mt-4 text-sm font-semibold">Where</h4>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{lib.where}</p>
      <h4 className="mt-4 text-sm font-semibold">How</h4>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{lib.how}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <h4 className="text-sm font-semibold">Cost</h4>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{lib.cost}</p>
        </div>
        <div>
          <h4 className="text-sm font-semibold">Already here?</h4>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{lib.present}</p>
        </div>
      </div>
      <code className="mt-5 block break-all text-xs text-muted-foreground">{lib.source}</code>
    </article>
  );

  const summaryBanner = (
    <section className="mb-6 rounded-xl border border-border bg-card p-5">
      <h2 className="text-lg font-semibold">{summary.headline}</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{summary.body}</p>
    </section>
  );

  const surfaceList = (
    <div className="flex flex-col gap-1">
      {surfaces.map((item) => (
        <Button
          key={item.id}
          variant={openSurface === item.id ? "secondary" : "ghost"}
          className="h-auto min-h-10 justify-start whitespace-normal py-3 text-left"
          onClick={() => setOpenSurface(item.id)}
        >
          <span className="flex-1">{item.name}</span>
          <span className="text-xs text-muted-foreground">{item.role}</span>
        </Button>
      ))}
    </div>
  );

  const surfaceDetail = (
    <article className="rounded-xl border border-border bg-card p-5" aria-live="polite">
      <h3 className="text-xl font-semibold">{surface.name}</h3>
      <p className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">{surface.role}</p>
      <p className="mt-4 text-sm leading-6 text-muted-foreground">{surface.detail}</p>
      <h4 className="mt-5 text-sm font-semibold">Constraint</h4>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{surface.constraint}</p>
      <h4 className="mt-5 text-sm font-semibold">Fit by library</h4>
      <div className="mt-2 flex flex-col gap-2">
        {surface.fit.map((f) => (
          <div key={f.lib} className="flex gap-3 rounded-lg border border-border p-3">
            <span className={`mt-0.5 shrink-0 ${f.good ? "text-emerald-400" : "text-muted-foreground"}`}>
              {f.good ? <Check className="size-4" /> : <Minus className="size-4" />}
            </span>
            <div>
              <span className="font-mono text-sm font-semibold">{f.lib}</span>
              <p className="text-sm leading-6 text-muted-foreground">{f.note}</p>
            </div>
          </div>
        ))}
      </div>
      <code className="mt-5 block break-all text-xs text-muted-foreground">{surface.source}</code>
    </article>
  );

  const ledger = (
    <section>
      <h2 className="mb-4 text-xl font-semibold">If the verdicts hold: recommended order</h2>
      <div className="flex flex-col gap-3">
        {sequence.map((step) => (
          <div key={step.order} className="flex gap-4 rounded-xl border border-border bg-card p-4">
            <span className="grid size-8 shrink-0 place-items-center rounded-full border border-border font-mono text-sm">
              {step.order}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold">{step.title}</h3>
                <Badge variant="outline" className="font-mono">{step.lib}</Badge>
                <Badge variant="outline">effort {step.effort}</Badge>
                <Badge variant={step.risk === "low" ? "secondary" : "outline"}>risk {step.risk}</Badge>
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.detail}</p>
              <code className="mt-2 block break-all text-xs text-muted-foreground">{step.source}</code>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => toggleStep(step.title)}
              >
                {accepted.includes(step.title) ? "Remove from plan" : "Add to plan"}
              </Button>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        The plan is a temporary selection and resets on reload.
      </p>
    </section>
  );

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-background pb-28 text-foreground">
      <header className="border-b border-border px-5 py-4">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold tracking-tight">foleyard</span>
            <span className="text-muted-foreground">/</span>
            <span className="text-sm">Library adoption review</span>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline">Findings prototype</Badge>
            <Button variant="ghost" size="sm" onClick={reset}>
              <RotateCcw data-icon="inline-start" />
              Reset
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 pt-9">
        <p className="text-xs uppercase tracking-widest text-primary">7 September 2026 · adoption review</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight md:text-5xl">
          zod, zustand, arktype.
          <br />
          <span className="text-muted-foreground">Where each one earns its place.</span>
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
          Read the same review three ways: by verdict, by the code surface each library touches, or as
          an ordered plan. Every claim points at a real file. Nothing here changes the app.
        </p>

        <div className="my-7 flex flex-wrap gap-5 border-y border-border py-4 text-sm">
          <span><strong>3</strong> libraries reviewed</span>
          <span><strong>3</strong> code surfaces</span>
          <span><strong>{sequence.length}</strong> ordered steps</span>
          <span><strong>{accepted.length}</strong> in your plan</span>
        </div>

        {summaryBanner}

        {variant === "A" && (
          <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
            <div className="grid gap-4">{libraries.map(verdictCard)}</div>
            <div>{detail}</div>
          </div>
        )}

        {variant === "B" && (
          <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
            <div>{surfaceList}</div>
            <div>{surfaceDetail}</div>
          </div>
        )}

        {variant === "C" && (
          <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
            {ledger}
            <div>{detail}</div>
          </div>
        )}

        <details open className="mt-8 rounded-xl border border-border p-5">
          <summary className="cursor-pointer text-sm font-semibold">Review state</summary>
          <pre className="mt-4 overflow-auto text-xs leading-5 text-muted-foreground">
            {JSON.stringify(state, null, 2)}
          </pre>
        </details>

        <p className="mt-6 text-xs text-muted-foreground">
          Handoff: findings live in ./findings.ts · Working branch: prototype/lib-adoption-review · No commits made.
        </p>
      </div>
      <PrototypeSwitcher variants={variants} current={variant} />
    </main>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<p>Loading review…</p>}>
      <LibAdoption />
    </Suspense>
  );
}
