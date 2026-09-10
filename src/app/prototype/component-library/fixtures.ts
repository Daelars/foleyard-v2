// PROTOTYPE ONLY — shared specimen data for `/prototype/component-library`.
// Both variants render the same content so the comparison is about the
// controls, not about what they happen to be showing.

import type { TagOrigin } from "@yard-core";
import type { PaletteEntry } from "@/components/CommandPalette/command-palette";

export type SpecimenTag = {
  name: string;
  provenance?: TagOrigin;
  confidence?: number;
};

export type SpecimenFile = {
  filename: string;
  meta: string;
  tags: SpecimenTag[];
  /** Tag that is "current" in this context, i.e. selected — not provenance. */
  current?: string;
};

export const SPECIMEN_FILES: SpecimenFile[] = [
  {
    filename: "rain_hit_deep_stereo_04.wav",
    meta: "WAV · 00:04 · 48 kHz · 1.4 MB",
    current: "impact",
    tags: [
      { name: "weather", provenance: "deterministic" },
      { name: "impact", provenance: "manual" },
      { name: "thunder", provenance: "semantic_ai", confidence: 0.92 },
    ],
  },
  {
    filename: "foley_cloth_rustle_light_take12_bounce_final.wav",
    meta: "WAV · 00:02 · 96 kHz · 2.1 MB",
    tags: [
      { name: "foley", provenance: "manual" },
      { name: "cloth", provenance: "deterministic" },
      { name: "movement", provenance: "semantic_ai", confidence: 0.41 },
      { name: "interior", provenance: "semantic_ai", confidence: 0.58 },
    ],
  },
  {
    filename: "whoosh_large_01.wav",
    meta: "WAV · 00:03 · 48 kHz · 0.9 MB",
    current: "whoosh",
    tags: [{ name: "whoosh", provenance: "deterministic" }],
  },
];

export const SPECIMEN_COMMANDS: PaletteEntry[] = [
  { id: "spec:0", label: "Go to Library", section: "view", hint: "view" },
  { id: "spec:1", label: "Go to Favorites", section: "view", hint: "view" },
  { id: "spec:2", label: "Go to Auto tag", section: "view", hint: "view" },
  { id: "spec:3", label: "Open settings", section: "view", hint: "view" },
  { id: "spec:4", label: "Autoplay on", section: "transport", hint: "transport" },
  { id: "spec:5", label: "Play rain_hit_deep_stereo_04.wav", section: "sound", hint: "sound" },
  { id: "spec:6", label: "Analyze untagged files with CLAP", section: "tool", hint: "tool" },
];

export type SpecimenSetting = {
  key: string;
  label: string;
  description: string;
  disabled?: boolean;
};

export const SPECIMEN_SETTINGS: SpecimenSetting[] = [
  {
    key: "autoTag",
    label: "Auto-tag new files",
    description: "Run filename rules after each scan completes.",
  },
  {
    key: "shelf",
    label: "Sound Shelf",
    description: "Keep a shortlist of sounds while browsing the library.",
  },
  {
    key: "janitor",
    label: "Folder Janitor",
    description: "Find stale and empty folders under your scan roots.",
  },
  {
    key: "semantic",
    label: "Semantic tagging",
    description: "Needs the local CLAP model. Download it to enable this.",
    disabled: true,
  },
];
