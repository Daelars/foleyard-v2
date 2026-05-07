import type { YardCoreEvent } from "./event-types";

type EventListener = (event: YardCoreEvent) => void;

export class EventBus {
  private readonly listeners = new Set<EventListener>();

  emit(event: YardCoreEvent) {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  subscribe(listener: EventListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
