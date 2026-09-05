import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import { fileTableGridClass, FILE_TABLE_GRID_DEFAULT } from "@/components/FileTable/layout";
import {
  getDesktopServerSnapshot,
  getDesktopSnapshot,
  notifyDesktopBridgeChanged,
  subscribeDesktopBridge,
  useDesktopApp,
} from "./desktop";

function Probe() {
  const desktop = useDesktopApp();
  return createElement("div", {
    "data-desktop": String(desktop),
    className: fileTableGridClass(desktop),
  });
}

function setFakeWindow(bridge: unknown) {
  (globalThis as unknown as { window?: unknown }).window =
    bridge === null ? undefined : ({ desktopBridge: bridge } as unknown);
}

afterEach(() => {
  setFakeWindow(null);
});

describe("desktop bridge snapshots", () => {
  it("renders the non-desktop layout on the server", () => {
    expect(getDesktopServerSnapshot()).toBe(false);
    expect(fileTableGridClass(false)).toBe(FILE_TABLE_GRID_DEFAULT);
    expect(fileTableGridClass(true)).not.toBe(FILE_TABLE_GRID_DEFAULT);
  });

  it("server and first client render agree in the desktop app", () => {
    const withoutBridge = renderToString(createElement(Probe));

    setFakeWindow({ isDesktop: true });
    expect(getDesktopSnapshot()).toBe(true);
    const withBridge = renderToString(createElement(Probe));

    // First client render uses the server snapshot (React hydration
    // behavior), so both agree on the non-desktop layout even when the
    // preload bridge is present; the live snapshot settles after hydration.
    expect(withBridge).toBe(withoutBridge);
    expect(withBridge).toContain(FILE_TABLE_GRID_DEFAULT);
    expect(withBridge).toContain('data-desktop="false"');
  });

  it("reads no bridge outside the desktop app", () => {
    setFakeWindow(null);
    expect(getDesktopSnapshot()).toBe(false);
  });

  it("notifies subscribers when the bridge is injected late", () => {
    setFakeWindow({});
    expect(getDesktopSnapshot()).toBe(false);

    let notifications = 0;
    const unsubscribe = subscribeDesktopBridge(() => {
      notifications += 1;
    });
    try {
      (
        (globalThis as { window: { desktopBridge?: unknown } }).window
      ).desktopBridge = { isDesktop: true };

      expect(notifications).toBe(1);
      expect(getDesktopSnapshot()).toBe(true);

      notifyDesktopBridgeChanged();
      expect(notifications).toBe(2);
    } finally {
      unsubscribe();
    }

    notifyDesktopBridgeChanged();
    expect(notifications).toBe(2);
  });
});
