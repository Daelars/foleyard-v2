// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AudioPlayerFileRecord } from "@/components/AudioPlayer/types";
import type { AudioPlayerPreferences } from "@/components/AudioPlayer/types";

import { V3AudioPlayer } from "./player";

// Area: #291. The player is the visible surface for session state: where the
// queue came from, media failures with recoverable actions, and a mute control
// that always routes through the coherent session toggle.

type Listener = (...args: unknown[]) => void;

class MockAudio {
  static instances: MockAudio[] = [];

  static reset() {
    MockAudio.instances = [];
  }

  src: string;
  preload = "";
  volume = 1;
  currentTime = 0;
  duration = 0;
  paused = true;
  error: { code: number } | null = null;
  private listeners = new Map<string, Set<Listener>>();

  constructor(src?: string) {
    this.src = src ?? "";
    MockAudio.instances.push(this);
  }

  addEventListener(type: string, listener: Listener) {
    const set = this.listeners.get(type) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: Listener) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type: string) {
    this.listeners.get(type)?.forEach((listener) => listener());
  }

  play() {
    this.paused = false;
    return Promise.resolve();
  }

  pause() {
    this.paused = true;
  }

  load() {}

  removeAttribute() {}
}

function record(id: string): AudioPlayerFileRecord {
  return {
    id,
    filename: `${id}.wav`,
    path: `/lib/${id}.wav`,
    format: "wav",
    duration: 30,
    fileSize: 1024,
    isFavorite: false,
    tags: [],
  };
}

function preferences(overrides: Partial<AudioPlayerPreferences> = {}): AudioPlayerPreferences {
  return {
    volume: 0.72,
    isMuted: false,
    handleVolumeChange: vi.fn(),
    toggleMute: vi.fn(),
    ...overrides,
  };
}

function renderPlayer(
  props: Partial<React.ComponentProps<typeof V3AudioPlayer>> = {},
) {
  return render(
    <V3AudioPlayer
      selectedFile={record("a")}
      preferences={preferences()}
      onClose={() => {}}
      onToggleFavorite={async () => {}}
      onNext={() => {}}
      onPrev={() => {}}
      autoplay={false}
      onToggleAutoplay={() => {}}
      collections={[]}
      onAddToCollection={async () => {}}
      playingFrom="Library"
      canStepQueue
      {...props}
    />,
  );
}

describe("V3AudioPlayer session state", () => {
  beforeEach(() => {
    MockAudio.reset();
    vi.stubGlobal("Audio", MockAudio);
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows where the queue came from", () => {
    renderPlayer();
    expect(screen.getByText("Playing from Library")).toBeTruthy();
  });

  it("surfaces a media error with recoverable actions", () => {
    renderPlayer();

    act(() => {
      const audio = MockAudio.instances[0]!;
      audio.error = { code: 4 };
      audio.dispatch("error");
    });

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toMatch(/missing|unsupported|format/i);
    expect(screen.getByRole("button", { name: /retry playback/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /play next sound/i })).toBeTruthy();
  });

  it("routes the mute control through the coherent session toggle", () => {
    const toggleMute = vi.fn();
    renderPlayer({ preferences: preferences({ toggleMute }) });

    fireEvent.click(screen.getByRole("button", { name: /mute audio/i }));
    expect(toggleMute).toHaveBeenCalledTimes(1);
  });

  it("presents an unmute control whenever the sound is muted", () => {
    renderPlayer({ preferences: preferences({ isMuted: true }) });
    expect(screen.getByRole("button", { name: /unmute audio/i })).toBeTruthy();
  });
});
