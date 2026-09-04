"use client";

// VARIANT A — "Call path". One command's journey, top to bottom, with the
// layer it crosses on the left and every way it can bail out on the right.
// Answers: what actually happens when a button fires an extension command?

import { useState } from "react";

import { EXTENSIONS, PIPELINE, UI_INTENTS, type Stage } from "./diagram-data";

const LAYER_STYLE: Record<Stage["layer"], string> = {
  Client: "border-sky-400/40 bg-sky-400/10 text-sky-300",
  HTTP: "border-violet-400/40 bg-violet-400/10 text-violet-300",
  Host: "border-accent-fill/50 bg-accent-fill/12 text-accent-text",
  Core: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
  Extension: "border-amber-400/40 bg-amber-400/10 text-amber-300",
};

const LAYER_DOT: Record<Stage["layer"], string> = {
  Client: "bg-sky-400",
  HTTP: "bg-violet-400",
  Host: "bg-accent-fill",
  Core: "bg-emerald-400",
  Extension: "bg-amber-400",
};

const LAYERS: Stage["layer"][] = ["Client", "HTTP", "Host", "Core", "Extension"];

export function VariantPipeline() {
  const [open, setOpen] = useState<string | null>("host");

  return (
    <div className="min-h-screen bg-[#0b0b10] px-6 py-10 pb-28 text-zinc-200">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent-text">
            Foleyard extensions
          </div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-white">
            The call path
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400">
            Every hosted extension command takes exactly this route. The left rail
            is the layer it is inside; the right gutter is every way it can stop
            early. Click a step to expand it.
          </p>
        </header>

        <div className="mb-8 flex flex-wrap gap-2">
          {LAYERS.map((layer) => (
            <span
              key={layer}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${LAYER_STYLE[layer]}`}
            >
              <span className={`size-1.5 rounded-full ${LAYER_DOT[layer]}`} />
              {layer}
            </span>
          ))}
        </div>

        <ol className="relative space-y-2">
          <span
            aria-hidden
            className="absolute bottom-6 left-[76px] top-6 w-px bg-gradient-to-b from-sky-400/40 via-accent-fill/40 to-amber-400/40"
          />

          {PIPELINE.map((stage, stageIndex) => {
            const expanded = open === stage.key;

            return (
              <li key={stage.key} className="relative flex gap-4">
                <div className="w-[60px] shrink-0 pt-3 text-right">
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider ${
                      LAYER_STYLE[stage.layer].split(" ").pop()
                    }`}
                  >
                    {stage.layer}
                  </span>
                </div>

                <div className="relative flex w-8 shrink-0 justify-center pt-4">
                  <span
                    className={`z-10 size-3 rounded-full ring-4 ring-[#0b0b10] ${LAYER_DOT[stage.layer]}`}
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : stage.key)}
                  className={`flex-1 rounded-lg border p-3 text-left transition-all ${
                    expanded
                      ? "border-white/20 bg-white/[0.06]"
                      : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]"
                  }`}
                >
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-[10px] text-zinc-600">
                      {String(stageIndex + 1).padStart(2, "0")}
                    </span>
                    <span className="text-sm font-semibold text-white">
                      {stage.title}
                    </span>
                  </div>
                  <div className="mt-0.5 font-mono text-[10px] text-zinc-500">
                    {stage.where}
                  </div>

                  {expanded && (
                    <p className="mt-2 border-t border-white/10 pt-2 text-[12px] leading-relaxed text-zinc-400">
                      {stage.does}
                    </p>
                  )}
                </button>

                <div className="w-[210px] shrink-0 space-y-1 pt-3">
                  {stage.fails.map((fail) => (
                    <div
                      key={fail}
                      className="flex items-center gap-1.5 text-[10px] text-zinc-500"
                    >
                      <span className="h-px w-3 shrink-0 bg-destructive/50" />
                      <span className="truncate rounded border border-destructive/30 bg-destructive/10 px-1.5 py-0.5 font-mono text-destructive">
                        {fail}
                      </span>
                    </div>
                  ))}
                </div>
              </li>
            );
          })}
        </ol>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <section className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
              The two return shapes
            </h2>
            <div className="mt-3 space-y-3 text-[12px] leading-relaxed text-zinc-400">
              <div>
                <code className="rounded bg-emerald-400/10 px-1.5 py-0.5 font-mono text-[11px] text-emerald-300">
                  type: &quot;value&quot;
                </code>{" "}
                — the handler did the work server-side and returned data.
              </div>
              <div>
                <code className="rounded bg-sky-400/10 px-1.5 py-0.5 font-mono text-[11px] text-sky-300">
                  type: &quot;ui-intent&quot;
                </code>{" "}
                — the handler cannot finish alone and asks the client to open
                something. The extension never imports a component; it returns a
                tagged object and the client decides what that means.
              </div>
            </div>
            <ul className="mt-3 space-y-1 border-t border-white/10 pt-3">
              {UI_INTENTS.map((intent) => (
                <li key={intent.type} className="flex items-center gap-2 text-[11px]">
                  <code className="font-mono text-sky-300">{intent.type}</code>
                  <span className="text-zinc-600">→</span>
                  <code className="font-mono text-zinc-500">{intent.action}</code>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
              The bypass lane
            </h2>
            <p className="mt-2 text-[12px] leading-relaxed text-zinc-400">
              <code className="font-mono text-[11px] text-violet-300">/execute</code>{" "}
              hard-rejects any request with an{" "}
              <code className="font-mono text-[11px] text-zinc-300">input</code>{" "}
              field. Commands that need typed input get their own route instead, so
              the generic host never has to validate arbitrary payloads.
            </p>
            <div className="mt-3 space-y-2">
              {EXTENSIONS.map((extension) => (
                <div key={extension.id}>
                  <div className="text-[11px] font-semibold text-zinc-300">
                    {extension.name}
                  </div>
                  {extension.dedicatedRoutes.map((route) => (
                    <div
                      key={route}
                      className="truncate font-mono text-[10px] text-zinc-600"
                    >
                      {route}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
