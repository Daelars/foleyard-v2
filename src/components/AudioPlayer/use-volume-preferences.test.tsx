// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useVolumePreferences } from "./use-volume-preferences";

// Area: #291. Mute and volume are session state: muting then unmuting must
// always produce an audible level, and a zero-volume slider must not leave an
// "unmute" control that stays silent.

describe("useVolumePreferences session mute", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("unmutes to an audible volume when the slider is at zero", () => {
    const { result } = renderHook(() => useVolumePreferences());

    act(() => {
      result.current.handleVolumeChange(0);
    });
    expect(result.current.volume).toBe(0);
    expect(result.current.isMuted).toBe(true);

    act(() => {
      result.current.toggleMute();
    });
    expect(result.current.isMuted).toBe(false);
    expect(result.current.volume).toBeGreaterThan(0);
  });

  it("restores the same level after muting at volume", () => {
    const { result } = renderHook(() => useVolumePreferences());

    act(() => {
      result.current.handleVolumeChange(0.4);
    });
    act(() => {
      result.current.toggleMute();
    });
    expect(result.current.isMuted).toBe(true);
    expect(result.current.volume).toBe(0.4);

    act(() => {
      result.current.toggleMute();
    });
    expect(result.current.isMuted).toBe(false);
    expect(result.current.volume).toBe(0.4);
  });

  it("starts muted at persisted zero volume and remembers a prior audible level", () => {
    window.localStorage.setItem("foleyard-volume", "0");
    const { result } = renderHook(() => useVolumePreferences());

    expect(result.current.volume).toBe(0);
    expect(result.current.isMuted).toBe(true);

    act(() => {
      result.current.handleVolumeChange(0.8);
    });
    act(() => {
      result.current.handleVolumeChange(0);
    });
    act(() => {
      result.current.toggleMute();
    });
    expect(result.current.isMuted).toBe(false);
    expect(result.current.volume).toBe(0.8);
  });

  it("raises the volume and unmutes when the slider moves off zero", () => {
    const { result } = renderHook(() => useVolumePreferences());

    act(() => {
      result.current.handleVolumeChange(0);
    });
    act(() => {
      result.current.handleVolumeChange(0.6);
    });
    expect(result.current.isMuted).toBe(false);
    expect(result.current.volume).toBe(0.6);
  });
});
