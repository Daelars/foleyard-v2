import rawRegistry from "../../electron/main/ipc-channels.cjs";

type IpcChannelKind = "invoke" | "send" | "event";

type RegistryShape = {
  CHANNELS: Record<string, string>;
  CHANNEL_SPECS: Record<string, { kind: IpcChannelKind; payload: string[] }>;
  validateIpcPayload: (channel: string, payload: unknown) => string | null;
};

const registry = rawRegistry as RegistryShape;

/**
 * The single Desktop bridge channel table, owned by
 * `electron/main/ipc-channels.cjs` and shared by main, preload, and this
 * renderer wrapper. Renaming a channel silently breaks drag, reveal, and
 * updates — the contract test pins every name and payload shape.
 */
export const DESKTOP_CHANNELS: Record<string, string> = registry.CHANNELS;
export const DESKTOP_CHANNEL_SPECS: RegistryShape["CHANNEL_SPECS"] = registry.CHANNEL_SPECS;

/** Null when the call is well-formed, otherwise the human-readable breakage. */
export function checkDesktopCall(channel: string, payload: unknown): string | null {
  return registry.validateIpcPayload(channel, payload);
}
