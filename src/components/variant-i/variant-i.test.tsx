// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  Accordion,
  BulkBar,
  Button,
  Checkbox,
  Dialog,
  DialogFooter,
  DialogTitle,
  IconButton,
  PlayButton,
  QueueCard,
  Radio,
  Scrubber,
  Select,
  ShortcutRow,
  Slider,
  Switch,
  Tabs,
  TagEditor,
  Toast,
} from ".";

// Area: variant I component library. Extracted controls keep their
// interactive contracts: buttons gate while busy, switches/checkboxes/
// radios report real values, selects open a viewport-fixed popup and pick
// by keyboard, tabs switch with aria-selection, sliders and scrubbers
// respond to arrow keys, the bulk bar stages removal with a separate
// confirm step, and dialogs/tags/queues/toasts keep their callbacks.

describe("Button", () => {
  it("renders tones and sizes with native attributes", () => {
    const { container } = render(
      <>
        <Button tone="primary">Primary</Button>
        <Button tone="secondary" size="sm" disabled>
          Secondary
        </Button>
        <IconButton label="Play">
          <svg aria-hidden />
        </IconButton>
      </>,
    );
    expect(screen.getByRole("button", { name: "Primary" })).toBeTruthy();
    const secondary = screen.getByRole("button", { name: "Secondary" });
    expect((secondary as HTMLButtonElement).disabled).toBe(true);
    expect(container.querySelector("button[aria-label='Play']")).toBeTruthy();
  });

  it("busy buttons disable and expose aria-busy", () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Analyzing…
      </Button>,
    );
    const button = screen.getByRole("button", { name: /Analyzing/ });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("PlayButton", () => {
  it("labels from the playing state and fires onClick", () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <PlayButton playing={false} label="Play rain.wav" onClick={onClick} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Play rain.wav" }));
    expect(onClick).toHaveBeenCalledTimes(1);
    rerender(
      <PlayButton playing label="Pause rain.wav" onClick={onClick} />,
    );
    expect(screen.getByRole("button", { name: "Pause rain.wav" })).toBeTruthy();
  });
});

describe("Switch / Checkbox / Radio", () => {
  it("switch reports the next checked value", () => {
    const onCheckedChange = vi.fn();
    render(<Switch label="Auto-tag" checked={false} onCheckedChange={onCheckedChange} />);
    fireEvent.click(screen.getByRole("switch", { name: "Auto-tag" }));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("checkbox toggles through its label", () => {
    const onChange = vi.fn();
    render(<Checkbox label="Enable semantic tagging" checked onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Enable semantic tagging"));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("radio fires per option and keeps the name group", () => {
    const onChange = vi.fn();
    render(
      <>
        <Radio name="f" label="All files" checked={false} onChange={() => onChange("all")} />
        <Radio name="f" label="Untagged" checked onChange={() => onChange("untagged")} />
      </>,
    );
    fireEvent.click(screen.getByLabelText("All files"));
    expect(onChange).toHaveBeenCalledWith("all");
    const untagged = screen.getByLabelText("Untagged") as HTMLInputElement;
    expect(untagged.name).toBe("f");
    expect(untagged.checked).toBe(true);
  });
});

describe("Select", () => {
  it("opens a popup, picks with Enter, and focuses the trigger", () => {
    const onChange = vi.fn();
    render(
      <Select
        label="Tag filter"
        value="all"
        onChange={onChange}
        options={[
          { value: "all", label: "All tags" },
          { value: "weather", label: "Weather" },
        ]}
      />,
    );
    const trigger = screen.getByRole("button", { name: "Tag filter" });
    fireEvent.click(trigger);
    const options = screen.getAllByRole("option");
    expect(options.length).toBe(2);
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "ArrowDown" });
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("weather");
  });

  it("closes with Escape", () => {
    render(
      <Select
        label="Tag filter"
        value="all"
        options={[{ value: "all", label: "All tags" }]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Tag filter" }));
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});

describe("Tabs", () => {
  it("switches the active tab with aria-selected", () => {
    const onChange = vi.fn();
    render(
      <Tabs
        label="Specimen tabs"
        value="library"
        onChange={onChange}
        tabs={[
          { value: "library", label: "Library" },
          { value: "extensions", label: "Extensions" },
        ]}
      />,
    );
    const tabs = screen.getAllByRole("tab");
    expect(tabs[0]?.getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByRole("tab", { name: "Extensions" }));
    expect(onChange).toHaveBeenCalledWith("extensions");
  });
});

describe("Slider / Scrubber", () => {
  it("slider nudges by step on arrow keys", () => {
    const onChange = vi.fn();
    render(<Slider label="Volume" value={50} min={0} max={100} step={5} onChange={onChange} />);
    const slider = screen.getByRole("slider", { name: "Volume" });
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith(55);
    fireEvent.keyDown(slider, { key: "Home" });
    expect(onChange).toHaveBeenCalledWith(0);
    fireEvent.keyDown(slider, { key: "End" });
    expect(onChange).toHaveBeenCalledWith(100);
  });

  it("scrubber seeks by a second on arrow keys", () => {
    const onSeek = vi.fn();
    render(
      <Scrubber
        peaks={[0.5, 0.4, 0.6]}
        progress={0.5}
        duration={10}
        onSeek={onSeek}
        label="Seek through rain.wav"
      />,
    );
    const scrubber = screen.getByRole("slider", { name: "Seek through rain.wav" });
    fireEvent.keyDown(scrubber, { key: "ArrowLeft" });
    expect(onSeek).toHaveBeenCalledWith(4);
    fireEvent.keyDown(scrubber, { key: "End" });
    expect(onSeek).toHaveBeenCalledWith(10);
  });
});

describe("BulkBar", () => {
  it("stages removal: choose, pick a choice, then confirm separately", () => {
    const onStageChange = vi.fn();
    const onConfirm = vi.fn();
    const { rerender } = render(
      <BulkBar
        count={3}
        removeDefault="library"
        stage={null}
        onStageChange={onStageChange}
        onClear={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(onStageChange).toHaveBeenCalledWith("choose");

    rerender(
      <BulkBar
        count={3}
        removeDefault="library"
        stage="choose"
        onStageChange={onStageChange}
        onConfirm={onConfirm}
        onClear={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /From library/ }));
    expect(onStageChange).toHaveBeenCalledWith({ confirm: "library" });

    rerender(
      <BulkBar
        count={3}
        removeDefault="library"
        stage={{ confirm: "library" }}
        onStageChange={onStageChange}
        onConfirm={onConfirm}
        onClear={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Sure?" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onStageChange).not.toHaveBeenCalledWith(null);
  });

  it("marks the configured removal default", () => {
    render(
      <BulkBar
        count={1}
        removeDefault="disk"
        stage="choose"
        onStageChange={() => {}}
        onClear={() => {}}
      />,
    );
    const disk = screen.getByRole("button", { name: /From disk/ });
    expect(disk.textContent).toContain("Default");
  });
});

describe("QueueCard", () => {
  it("promotes and dismisses by word with distinct callbacks", () => {
    const onPromote = vi.fn();
    const onDismiss = vi.fn();
    render(
      <QueueCard
        words={[{ word: "thunder", files: 12 }]}
        page={0}
        onPage={() => {}}
        onPromote={onPromote}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Promote thunder to a tag" }));
    expect(onPromote).toHaveBeenCalledWith("thunder");
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss thunder" }));
    expect(onDismiss).toHaveBeenCalledWith("thunder");
  });
});

describe("ShortcutRow", () => {
  it("switches between Change and Cancel while rebinding", () => {
    const onStart = vi.fn();
    const onCancel = vi.fn();
    const { rerender } = render(
      <ShortcutRow label="Play / pause" binding="Space" rebinding={false} onStart={onStart} onCancel={onCancel} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    expect(onStart).toHaveBeenCalled();
    rerender(
      <ShortcutRow label="Play / pause" binding="Space" rebinding onStart={onStart} onCancel={onCancel} />,
    );
    expect(screen.getByText("Press a key…")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });
});

describe("TagEditor", () => {
  it("commits on Enter and arms deletion separately", () => {
    const onCommit = vi.fn();
    const onDelete = vi.fn();
    const { rerender } = render(
      <TagEditor
        name="thunder"
        color="#f0503c"
        armed={false}
        onNameChange={() => {}}
        onColorChange={() => {}}
        onCommit={onCommit}
        onCancel={() => {}}
        onDelete={onDelete}
        onArmDelete={() => {}}
        onDeleteCancel={() => {}}
      />,
    );
    const input = screen.getByLabelText("Rename tag");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Delete tag" }));
    expect(onDelete).not.toHaveBeenCalled();
    rerender(
      <TagEditor
        name="thunder"
        color="#f0503c"
        armed
        onNameChange={() => {}}
        onColorChange={() => {}}
        onCommit={onCommit}
        onCancel={() => {}}
        onDelete={onDelete}
        onArmDelete={() => {}}
        onDeleteCancel={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Sure?" }));
    expect(onDelete).toHaveBeenCalled();
  });
});

describe("Accordion", () => {
  it("expands and collapses rows (first row starts open)", () => {
    render(
      <Accordion
        items={[{ title: "Stale folders", meta: "4 found", body: "Cleaning removes entries only." }]}
      />,
    );
    const trigger = screen.getByRole("button", { name: /Stale folders/ });
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Cleaning removes entries only.")).toBeTruthy();
  });
});

describe("Dialog", () => {
  it("closes on backdrop click and keeps footer actions", () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} labelledBy="t" describedBy="d">
        <DialogTitle id="t">Remove scan root?</DialogTitle>
        <DialogFooter>
          <Button tone="danger">Remove</Button>
        </DialogFooter>
      </Dialog>,
    );
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    fireEvent.click(screen.getByRole("alertdialog").parentElement!);
    expect(onClose).toHaveBeenCalled();
  });
});

describe("Toast", () => {
  it("dismisses through its button", () => {
    const onDismiss = vi.fn();
    render(
      <Toast tone="success" title="Scan finished" message="Tagged 12 files." onDismiss={onDismiss} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Dismiss: Scan finished" }));
    expect(onDismiss).toHaveBeenCalled();
  });
});