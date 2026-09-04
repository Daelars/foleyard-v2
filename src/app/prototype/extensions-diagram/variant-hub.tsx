"use client";

// VARIANT B — "Reach map". Host at the centre, extensions in the inner ring,
// Yard Core services in the outer ring. Edges are permissions, so the picture
// answers: what can each extension actually touch, and who overlaps?

import { useState } from "react";

import {
  EXTENSIONS,
  PERMISSION_TO_SERVICE,
  SERVICES,
  type Extension,
} from "./diagram-data";

const W = 900;
const H = 720;
const CX = W / 2;
const CY = H / 2;
const EXT_R = 150;
const SVC_R = 285;

/** Rounded, because raw trig differs in the last float digit between server and
 *  browser and React flags that as a hydration mismatch. */
function round(value: number) {
  return Math.round(value * 100) / 100;
}

function polar(radius: number, degrees: number) {
  const radians = ((degrees - 90) * Math.PI) / 180;
  return {
    x: round(CX + radius * Math.cos(radians)),
    y: round(CY + radius * Math.sin(radians)),
  };
}

const EXT_NODES = EXTENSIONS.map((extension, index) => ({
  extension,
  angle: index * (360 / EXTENSIONS.length),
  ...polar(EXT_R, index * (360 / EXTENSIONS.length)),
}));

const SVC_NODES = SERVICES.map((service, index) => {
  const angle = index * (360 / SERVICES.length) + 18;
  return { service, angle, ...polar(SVC_R, angle) };
});

/** Distinct services an extension can reach, derived from its permissions. */
function reachOf(extension: Extension) {
  return new Set(
    extension.permissions.map((permission) => PERMISSION_TO_SERVICE[permission]),
  );
}

function curve(
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  // Bow the edge away from the centre so bundles stay legible.
  const cx = round(mx + (mx - CX) * 0.25);
  const cy = round(my + (my - CY) * 0.25);
  return `M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}`;
}

export function VariantHub() {
  const [focus, setFocus] = useState<string | null>(null);
  const focused = EXTENSIONS.find((extension) => extension.id === focus) ?? null;
  const focusReach = focused ? reachOf(focused) : null;

  return (
    <div className="min-h-screen bg-[#0b0b10] px-6 py-10 pb-28 text-zinc-200">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent-text">
            Foleyard extensions
          </div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-white">
            Reach map
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400">
            Nothing in the inner ring imports anything in the outer ring. An
            extension declares permissions in its manifest; the host turns those
            into the only services its context exposes. Hover an extension to see
            its reach.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
          <div className="rounded-xl border border-white/10 bg-white/[0.015]">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
              <circle
                cx={CX}
                cy={CY}
                r={EXT_R}
                fill="none"
                stroke="#ffffff12"
                strokeDasharray="2 6"
              />
              <circle
                cx={CX}
                cy={CY}
                r={SVC_R}
                fill="none"
                stroke="#ffffff0d"
                strokeDasharray="2 6"
              />

              {/* Permission edges: extension → service */}
              {EXT_NODES.map((node) => {
                const reach = reachOf(node.extension);
                const dim = focus !== null && focus !== node.extension.id;

                return SVC_NODES.filter((svc) => reach.has(svc.service.id)).map(
                  (svc) => (
                    <path
                      key={`${node.extension.id}-${svc.service.id}`}
                      d={curve(node, svc)}
                      fill="none"
                      stroke={
                        focus === node.extension.id ? "#ff7a66" : "#ffffff"
                      }
                      strokeWidth={focus === node.extension.id ? 1.6 : 1}
                      strokeOpacity={dim ? 0.04 : focus ? 0.75 : 0.14}
                      className="transition-all duration-200"
                    />
                  ),
                );
              })}

              {/* Registration edges: host → extension */}
              {EXT_NODES.map((node) => (
                <line
                  key={`host-${node.extension.id}`}
                  x1={CX}
                  y1={CY}
                  x2={node.x}
                  y2={node.y}
                  stroke="#f0503c"
                  strokeWidth={focus === node.extension.id ? 2 : 1}
                  strokeOpacity={
                    focus && focus !== node.extension.id ? 0.12 : 0.55
                  }
                  className="transition-all duration-200"
                />
              ))}

              {/* Host */}
              <circle cx={CX} cy={CY} r={54} fill="#1a0e0c" stroke="#f0503c" strokeWidth={1.5} />
              <text
                x={CX}
                y={CY - 6}
                textAnchor="middle"
                className="fill-white text-[13px] font-bold"
              >
                Host
              </text>
              <text
                x={CX}
                y={CY + 10}
                textAnchor="middle"
                className="fill-zinc-500 text-[9px]"
              >
                registry
              </text>
              <text
                x={CX}
                y={CY + 22}
                textAnchor="middle"
                className="fill-zinc-500 text-[9px]"
              >
                + enabled + scope
              </text>

              {/* Extension nodes */}
              {EXT_NODES.map((node) => {
                const active = focus === node.extension.id;
                const dim = focus !== null && !active;

                return (
                  <g
                    key={node.extension.id}
                    onMouseEnter={() => setFocus(node.extension.id)}
                    onMouseLeave={() => setFocus(null)}
                    className="cursor-pointer"
                    opacity={dim ? 0.3 : 1}
                  >
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={38}
                      fill={active ? "#2a1512" : "#15151b"}
                      stroke={active ? "#ff7a66" : "#ffffff2a"}
                      strokeWidth={active ? 2 : 1}
                    />
                    <text
                      x={node.x}
                      y={node.y - 2}
                      textAnchor="middle"
                      className="pointer-events-none fill-white text-[10px] font-semibold"
                    >
                      {node.extension.name.split(" ")[0]}
                    </text>
                    <text
                      x={node.x}
                      y={node.y + 10}
                      textAnchor="middle"
                      className="pointer-events-none fill-zinc-400 text-[10px]"
                    >
                      {node.extension.name.split(" ")[1] ?? ""}
                    </text>
                    <text
                      x={node.x}
                      y={node.y + 22}
                      textAnchor="middle"
                      className="pointer-events-none fill-zinc-600 text-[8px]"
                    >
                      {node.extension.permissions.length} perms
                    </text>
                  </g>
                );
              })}

              {/* Service nodes */}
              {SVC_NODES.map((node) => {
                const lit = focusReach?.has(node.service.id) ?? false;
                const dim = focus !== null && !lit;
                const right = node.x >= CX;

                return (
                  <g key={node.service.id} opacity={dim ? 0.22 : 1}>
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={7}
                      fill={lit ? "#ff7a66" : "#ffffff1f"}
                      stroke={lit ? "#ff7a66" : "#ffffff33"}
                    />
                    <text
                      x={right ? node.x + 14 : node.x - 14}
                      y={node.y + 1}
                      textAnchor={right ? "start" : "end"}
                      className={`text-[11px] font-semibold ${
                        lit ? "fill-accent-text" : "fill-zinc-400"
                      }`}
                    >
                      {node.service.label}
                    </text>
                    <text
                      x={right ? node.x + 14 : node.x - 14}
                      y={node.y + 13}
                      textAnchor={right ? "start" : "end"}
                      className="fill-zinc-600 text-[9px]"
                    >
                      {node.service.note}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          <aside className="space-y-3">
            <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                Edges
              </div>
              <div className="mt-2 space-y-1.5 text-[11px] text-zinc-400">
                <div className="flex items-center gap-2">
                  <span className="h-px w-6 bg-accent-fill" />
                  registered into the host
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-px w-6 bg-white/25" />
                  permission → context service
                </div>
              </div>
            </div>

            {focused ? (
              <div className="rounded-lg border border-accent-fill/40 bg-accent-fill/[0.06] p-3">
                <div className="text-sm font-semibold text-white">
                  {focused.name}
                </div>
                <div className="mt-0.5 font-mono text-[10px] text-zinc-500">
                  {focused.id} · {focused.category}
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">
                  {focused.blurb}
                </p>
                <div className="mt-3 flex flex-wrap gap-1">
                  {focused.permissions.map((permission) => (
                    <span
                      key={permission}
                      className="rounded border border-accent-fill/40 bg-accent-fill/10 px-1.5 py-0.5 font-mono text-[9px] text-accent-text"
                    >
                      {permission}
                    </span>
                  ))}
                </div>
                <div className="mt-3 border-t border-white/10 pt-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-600">
                    Surfaces
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {focused.surfaces.map((surface) => (
                      <span
                        key={surface}
                        className="rounded border border-white/10 px-1.5 py-0.5 text-[9px] text-zinc-400"
                      >
                        {surface}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 text-[11px] leading-relaxed text-zinc-500">
                Hover an extension. Every one of the six holds{" "}
                <code className="font-mono text-zinc-400">library:read</code>{" "}
                except Smart Collections, which is the only one reaching{" "}
                <code className="font-mono text-zinc-400">CollectionService</code>.
                No extension currently asks for tags, favorites, or desktop
                permissions — those slots exist and are unused.
              </div>
            )}

            <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                Enforcement
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-400">
                The manifest list is not advisory. It becomes a{" "}
                <code className="font-mono text-[10px] text-zinc-300">
                  PermissionChecker
                </code>
                , and a handler calling{" "}
                <code className="font-mono text-[10px] text-zinc-300">
                  permissions.require()
                </code>{" "}
                for something undeclared throws{" "}
                <code className="font-mono text-[10px] text-destructive">
                  YardPermissionError
                </code>
                , which the host reports as{" "}
                <code className="font-mono text-[10px] text-destructive">
                  permission-denied
                </code>
                .
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
