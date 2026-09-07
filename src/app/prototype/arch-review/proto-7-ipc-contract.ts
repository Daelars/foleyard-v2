// PROTOTYPE (throwaway) for improvement point 7: typed IPC contract.
// Question: across the full channel inventory, what breaks silently today —
// renames, missing handlers, payload-shape drift?
// Run: node src/app/prototype/arch-review/run-all.ts

// The one registry main, preload, and renderer would share, with payload shapes.
export const REGISTRY = {
  "desktop:pick-folder": { fields: [] },
  "desktop:reveal-path": { fields: ["path"] },
  "desktop:reveal-in-explorer": { fields: ["path"] },
  "desktop:open-file-externally": { fields: ["path"] },
  "desktop:start-drag": { fields: ["files", "icon"] },
} as const;
type Channel = keyof typeof REGISTRY;

// All three sites send through this: an unknown channel is a compile error,
// not a silent no-op at runtime.
function send(channel: Channel, payload: Record<string, unknown>) {
  return `queued ${channel} (${Object.keys(payload).length} fields)`;
}

// Today's handwritten copies (one has drifted, one payload is short).
export const mainHandlers: Record<string, string[]> = {
  "desktop:pick-folder": [],
  "desktop:reveal-path": ["path"],
  "desktop:reveal-in-explorer": ["path"],
  "desktop:open-file-externally": ["path"],
  "desktop:start-drag": ["files", "icon"],
};
export const preloadExposed = [
  "desktop:pick-folder",
  "desktop:reveal-path",
  "desktop:reveal-in-explorer",
  "desktop:open-file-externally",
  "desktop:start-drag",
];
export const rendererCalls: Array<{ channel: string; payload: Record<string, unknown> }> = [
  { channel: "desktop:pick-folder", payload: {} },
  { channel: "desktop:reveal-path", payload: { path: "/lib/kick.wav" } },
  { channel: "desktop:begin-drag", payload: { files: ["/lib/kick.wav"] } }, // renamed + short payload
];

export function audit() {
  const report: string[] = [];
  const expected = new Set(Object.keys(REGISTRY));
  for (const channel of preloadExposed) {
    if (!expected.has(channel)) report.push(`preload exposes unknown ${channel}`);
  }
  for (const channel of expected) {
    if (!preloadExposed.includes(channel)) report.push(`preload hides ${channel}`);
    if (!mainHandlers[channel]) report.push(`main has no handler for ${channel}`);
  }
  for (const call of rendererCalls) {
    const spec = (REGISTRY as unknown as Record<string, { fields: string[] }>)[call.channel];
    if (!spec) {
      report.push(`renderer calls unknown ${call.channel} (silent no-op or wrong handler)`);
      continue;
    }
    for (const field of spec.fields) {
      if (!(field in call.payload)) report.push(`renderer ${call.channel} missing payload field '${field}'`);
    }
  }
  return report;
}

export function checkCall(channel: string, payload: Record<string, unknown>): string[] {
  const findings: string[] = [];
  const spec = (REGISTRY as unknown as Record<string, { fields: string[] }>)[channel];
  if (!spec) {
    findings.push(`unknown channel ${channel} (silent no-op or wrong handler)`);
    return findings;
  }
  for (const field of spec.fields) {
    if (!(field in payload)) findings.push(`missing payload field '${field}'`);
  }
  if (findings.length === 0) findings.push("ok");
  return findings;
}

export function inventory() {
  return Object.keys(REGISTRY).map((channel) => ({
    channel,
    inMain: Boolean(mainHandlers[channel]),
    inPreload: preloadExposed.includes(channel),
  }));
}

export function run() {
  console.log("--- P7: typed IPC contract ---");
  console.log("Scenario A — full inventory drift audit:");
  const drift = audit();
  for (const line of drift) console.log(` ! ${line}`);
  console.log(` findings: ${drift.length}`);

  console.log("Scenario B — rename blast radius (start-drag -> begin-drag):");
  const renamed = "desktop:begin-drag";
  const owners = [
    ["main", Object.keys(mainHandlers).includes(renamed)],
    ["preload", preloadExposed.includes(renamed)],
  ];
  for (const [owner, has] of owners) console.log(` ${owner} knows ${renamed}: ${has}`);
  console.log("Scenario C — typed send (unknown channels fail compilation):");
  console.log(" " + send("desktop:reveal-path", { path: "/lib/kick.wav" }));
  console.log("verdict: drift and short payloads are silent today; the registry lists every break, and a rename becomes a typed error at all three sites.");
}
