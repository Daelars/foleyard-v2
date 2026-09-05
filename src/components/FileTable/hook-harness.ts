/**
 * Minimal React hook dispatcher for non-DOM stability tests.
 *
 * The FileTable desktop-actions hook must return referentially stable
 * callbacks across renders. There is no DOM environment in this repo, so
 * instead of a renderer this harness backs useState/useMemo/useCallback/
 * useRef/useSyncExternalStore with a slot array: call resetHookCursor()
 * between invocations of the hook under test to simulate re-renders.
 */

export type HookDeps = readonly unknown[] | undefined;

interface HookSlot {
  kind: "state" | "memo" | "ref";
  value: unknown;
  deps?: HookDeps;
}

const slots: HookSlot[] = [];
let cursor = 0;

export function resetHookCursor() {
  cursor = 0;
}

export function resetHookSlots() {
  cursor = 0;
  slots.length = 0;
}

function depsEqual(next: HookDeps, prev: HookDeps): boolean {
  if (next === undefined || prev === undefined || next.length !== prev.length) {
    return false;
  }
  return next.every((value, index) => Object.is(value, prev[index]));
}

export function mockUseState<S>(
  initial: S | (() => S),
): [S, (update: S | ((prev: S) => S)) => void] {
  const index = cursor++;
  if (slots.length <= index) {
    slots.push({
      kind: "state",
      value:
        typeof initial === "function"
          ? (initial as () => S)()
          : initial,
    });
  }
  const slot = slots[index];
  const setState = (update: S | ((prev: S) => S)) => {
    slot.value =
      typeof update === "function"
        ? (update as (prev: S) => S)(slot.value as S)
        : update;
  };
  return [slot.value as S, setState];
}

export function mockUseMemo<T>(factory: () => T, deps: HookDeps): T {
  const index = cursor++;
  const slot = slots[index];
  if (!slot || slot.kind !== "memo" || !depsEqual(deps, slot.deps)) {
    const value = factory();
    slots[index] = { kind: "memo", value, deps };
    return value;
  }
  return slot.value as T;
}

export function mockUseCallback<T>(fn: T, deps: HookDeps): T {
  return mockUseMemo(() => fn, deps);
}

export function mockUseRef<T>(initial: T): { current: T } {
  const index = cursor++;
  if (slots.length <= index) {
    slots.push({ kind: "ref", value: { current: initial } });
  }
  return slots[index].value as { current: T };
}

export function mockUseEffect(): void {}

export function mockUseSyncExternalStore(
  _subscribe: () => () => void,
  getSnapshot: () => boolean,
): boolean {
  return getSnapshot();
}
