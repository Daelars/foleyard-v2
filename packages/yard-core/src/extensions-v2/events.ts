/**
 * Typed v2 extension events (Yard Core context, R7).
 *
 * Only the event contracts settings, state, jobs, and contribution
 * refresh need — nothing else is emitted, and high-frequency renderer
 * state (per-chunk job progress, form keystrokes, preview scrolling) is
 * never an event payload and never persisted.
 *
 * Ownership: only the host (or its application adapters) emits. Extension
 * handlers never receive the bus, so an extension cannot forge events for
 * another extension's namespace. Every payload names its owning
 * extension; subscribers ignore payloads outside the namespaces they serve.
 *
 * Delivery guarantee: persist-before-notify. Stores write to their ports
 * first and emit afterwards, so a subscriber that re-reads on receipt
 * always observes the change that triggered the event. Events are
 * notifications, not state of record: recovery is always a reread of the
 * owning store (settings/state/jobs/catalog), keyed by the payload's
 * sequence number to detect gaps after a dropped listener or reload.
 *
 * Subscription disposal: `subscribe` returns an unsubscribe function.
 * Renderer adapters (ticket #170) must call it on unmount/disable; the
 * bus holds no other references to listeners.
 *
 * Framework-free: no React, routes, database handles, or v1 imports.
 */

export type V2EventType =
  | "settings-changed"
  | "state-changed"
  | "approvals-changed"
  | "job-transition"
  | "contributions-changed";

export type V2EventPayload = {
  /** Monotonic per-bus sequence; subscribers use it to detect gaps. */
  sequence: number;
  /** ISO timestamp of emission (after persistence completed). */
  at: string;
  type: V2EventType;
  /** Owning extension; `"*"` only for `contributions-changed` refresh hints. */
  extensionId: string;
  /** Changed setting IDs (`settings-changed`) or state keys (`state-changed`). */
  keys?: string[];
  /** Job ID and terminal state (`job-transition` only). */
  jobId?: string;
  jobState?: string;
};

export type V2EventListener = (payload: V2EventPayload) => void;

/** Read-only subscriber surface handed to renderers; emitting stays host-side. */
export type V2EventSubscriber = {
  subscribe(type: V2EventType | "*", listener: V2EventListener): () => void;
  listenerCount(type?: V2EventType | "*"): number;
};

export type V2EventBusOptions = {
  clock?: () => string;
};

export class V2EventBus implements V2EventSubscriber {
  private readonly listeners = new Map<string, Set<V2EventListener>>();
  private sequence = 0;
  private readonly clock: () => string;

  constructor(options?: V2EventBusOptions) {
    this.clock = options?.clock ?? (() => new Date().toISOString());
  }

  /**
   * Subscribe to one event type (or `"*"` for all). Returns an
   * unsubscribe function; calling it twice is harmless.
   */
  subscribe(type: V2EventType | "*", listener: V2EventListener): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener);
    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      set.delete(listener);
    };
  }

  listenerCount(type?: V2EventType | "*"): number {
    if (type !== undefined) return this.listeners.get(type)?.size ?? 0;
    let total = 0;
    for (const set of this.listeners.values()) total += set.size;
    return total;
  }

  /** Host-only emission. Extension code never receives the bus. */
  emit(
    type: V2EventType,
    extensionId: string,
    detail?: Pick<V2EventPayload, "keys" | "jobId" | "jobState">,
  ): V2EventPayload {
    this.sequence += 1;
    const payload: V2EventPayload = {
      sequence: this.sequence,
      at: this.clock(),
      type,
      extensionId,
      ...(detail?.keys !== undefined ? { keys: [...detail.keys] } : {}),
      ...(detail?.jobId !== undefined ? { jobId: detail.jobId } : {}),
      ...(detail?.jobState !== undefined ? { jobState: detail.jobState } : {}),
    };
    for (const key of [type, "*"] as const) {
      for (const listener of this.listeners.get(key) ?? []) {
        listener({ ...payload, ...(payload.keys ? { keys: [...payload.keys] } : {}) });
      }
    }
    return payload;
  }

  /** Current sequence for gap detection after reconnect/reload. */
  currentSequence(): number {
    return this.sequence;
  }
}
