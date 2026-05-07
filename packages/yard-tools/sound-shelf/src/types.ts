export type SoundShelfResult = {
  added: number;
  removed: number;
  remaining: number;
};

export type SoundShelfItem = {
  fileId: string;
};

export type SoundShelfViewItem = {
  fileId: string;
  filename: string;
  duration: number | null;
  format: string | null;
};
