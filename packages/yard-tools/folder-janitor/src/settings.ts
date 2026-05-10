import type { YardSetting } from "yard-core";

export const settings: YardSetting[] = [
  {
    id: "tiny-file-threshold-bytes",
    label: "Tiny file threshold",
    description: "Files below this size are reported as junk candidates.",
    type: "number",
    defaultValue: 1024,
  },
  {
    id: "allowed-formats",
    label: "Allowed formats",
    description: "Comma-separated audio formats considered normal.",
    type: "string",
    defaultValue: "wav,aif,aiff,mp3,flac,ogg,m4a,aac",
  },
];
