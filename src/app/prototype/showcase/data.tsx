"use client";

export type DemoSound = {
  id: string;
  filename: string;
  format: string;
  duration: string;
  tags: string[];
};

export type DemoCollection = {
  id: string;
  name: string;
  fileCount: number;
  color: string;
};

export type DemoTag = {
  id: string;
  name: string;
  color: string;
};

export const DEMO_SOUNDS: DemoSound[] = [
  { id: "s1", filename: "Metal Door Slam", format: "wav", duration: "0:02", tags: ["impact", "metal"] },
  { id: "s2", filename: "Forest Night Bed", format: "flac", duration: "0:15", tags: ["ambience", "night"] },
  { id: "s3", filename: "Glass Break Small", format: "mp3", duration: "0:01", tags: ["impact", "glass"] },
  { id: "s4", filename: "Neon Hum Loop", format: "wav", duration: "0:08", tags: ["ambience", "loop"] },
  { id: "s5", filename: "Gravel Footsteps", format: "mp3", duration: "0:06", tags: ["foley", "steps"] },
  { id: "s6", filename: "Sword Unsheath", format: "wav", duration: "0:01", tags: ["weapon", "metal"] },
];

export const DEMO_COLLECTIONS: DemoCollection[] = [
  { id: "c1", name: "Impacts", fileCount: 24, color: "#f0503c" },
  { id: "c2", name: "Rain beds", fileCount: 11, color: "#7ab8ff" },
  { id: "c3", name: "UI clicks", fileCount: 48, color: "#9adc6e" },
  { id: "c4", name: "Trailer hits", fileCount: 7, color: "#d3a6ff" },
];

export const DEMO_TAGS: DemoTag[] = [
  { id: "t1", name: "impact", color: "#f0503c" },
  { id: "t2", name: "ambience", color: "#7ab8ff" },
  { id: "t3", name: "foley", color: "#9adc6e" },
  { id: "t4", name: "loop", color: "#d3a6ff" },
  { id: "t5", name: "metal", color: "#e8c468" },
];

export const COLOR_PRESETS = [
  "#f0503c",
  "#e8c468",
  "#9adc6e",
  "#5ad1e6",
  "#7ab8ff",
  "#d3a6ff",
  "#ff8ab5",
  "#a3a3a3",
];

export function tileStyle(color: string): React.CSSProperties {
  return { backgroundColor: `${color}1f`, color };
}

function pseudoRandom(seed: number): number[] {
  let state = seed * 1013 + 77;
  const next = () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
  return Array.from({ length: 48 }, (_, i) => 0.12 + next() * 0.88 * (0.5 + 0.5 * Math.sin(i / 5 + seed)));
}

export function MiniBars({
  seed,
  active = false,
  className = "",
}: {
  seed: number;
  active?: boolean;
  className?: string;
}) {
  const bars = pseudoRandom(seed);
  return (
    <div className={`flex h-full w-full items-center gap-[2px] ${className}`} aria-hidden="true">
      {bars.map((value, i) => (
        <span
          key={i}
          style={{ height: `${Math.round(value * 100)}%` }}
          className={`w-full min-w-[2px] rounded-full ${active ? "bg-accent-fill" : "bg-white/25"}`}
        />
      ))}
    </div>
  );
}

export function VariantFrame({
  id,
  name,
  note,
  children,
}: {
  id: string;
  name: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/30">
      <div className="flex items-baseline gap-3 border-b border-white/5 px-4 py-2.5">
        <span className="font-mono text-[11px] font-bold text-accent-text">{id}</span>
        <span className="text-sm font-semibold text-zinc-100">{name}</span>
        <span className="truncate text-xs text-zinc-500">{note}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

export function SectionShell({
  index,
  title,
  question,
  children,
}: {
  index: string;
  title: string;
  question: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mx-auto w-full max-w-5xl space-y-4 px-4 md:px-6">
      <div>
        <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-accent-text">
          {index}
        </p>
        <h2 className="mt-1 text-3xl font-bold tracking-tight text-zinc-50">{title}</h2>
        <p className="mt-1 text-sm text-zinc-400">{question}</p>
      </div>
      {children}
    </section>
  );
}
