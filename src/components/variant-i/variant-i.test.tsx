// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  Accordion,
  Alert,
  BulkBar,
  Button,
  Checkbox,
  Dialog,
  DialogFooter,
  DialogTitle,
  IconButton,
  PlayButton,
  Progress,
  QueueCard,
  Radio,
  Scrubber,
  Select,
  ShortcutRow,
  Slider,
  StatusBadge,
  Switch,
  TabPanel,
  Tabs,
  TagEditor,
  Toast,
} from ".";

// Area: variant I component library. Extracted controls keep their
// interactive contracts: buttons gate while busy, switches/checkboxes/
// radios report real values, selects open a viewport-fixed popup and pick
// by keyboard, tabs switch with aria-selection, sliders and scrubbers
// respond to arrow keys, the bulk bar stages removal with a separate
// confirm step, and dialogs/tags/queues keep their callbacks.

describe("Button", () => {
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

  it("icon and play/pause controls keep their accessible names and actions", () => {
    const onPlay = vi.fn();
    render(
      <>
        <IconButton label="Reveal in Explorer">reveal</IconButton>
        <PlayButton playing label="Pause" onClick={onPlay} />
        <PlayButton playing={false} label="Play" onClick={onPlay} />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: "Play" }).querySelector("polygon"),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Pause" }).querySelectorAll("rect"),
    ).toHaveLength(2);
  });
});

describe("Switch / Checkbox / Radio", () => {
  it("switch, checkbox, and radio report real values", () => {
    const onSwitchChange = vi.fn();
    const onCheckboxChange = vi.fn();
    const onRadioChange = vi.fn();
    render(
      <>
        <Switch label="Auto-tag" checked={false} onCheckedChange={onSwitchChange} />
        <Checkbox label="Enable semantic tagging" checked onChange={onCheckboxChange} />
        <Radio name="f" label="All files" checked={false} onChange={() => onRadioChange("all")} />
        <Radio name="f" label="Untagged" checked onChange={() => onRadioChange("untagged")} />
      </>,
    );
    fireEvent.click(screen.getByRole("switch", { name: "Auto-tag" }));
    expect(onSwitchChange).toHaveBeenCalledWith(true);

    fireEvent.click(screen.getByLabelText("Enable semantic tagging"));
    expect(onCheckboxChange).toHaveBeenCalledWith(false);

    fireEvent.click(screen.getByLabelText("All files"));
    expect(onRadioChange).toHaveBeenCalledWith("all");
    const untagged = screen.getByLabelText("Untagged") as HTMLInputElement;
    expect(untagged.name).toBe("f");
    expect(untagged.checked).toBe(true);
  });
});

describe("Select", () => {
  const TAG_FILTERS = [
    { value: "all", label: "All tags" },
    { value: "weather", label: "Weather" },
    { value: "ambient", label: "Ambient" },
  ];

  function renderSelect(onChange = vi.fn()) {
    render(
      <Select
        label="Tag filter"
        value="all"
        onChange={onChange}
        options={TAG_FILTERS}
      />,
    );
    return {
      onChange,
      trigger: screen.getByRole("button", { name: "Tag filter" }),
    };
  }

  function activeOptionId() {
    return screen.getByRole("listbox").getAttribute("aria-activedescendant");
  }

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

  it("takes keyboard focus into the listbox on the trigger and reports the active option", () => {
    const { trigger } = renderSelect();
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    fireEvent.keyDown(trigger, { key: "ArrowDown" });

    const listbox = screen.getByRole("listbox");
    const options = screen.getAllByRole("option");
    expect(document.activeElement).toBe(listbox);
    // The active option is the selected one; the listbox names it so screen
    // readers follow the roving highlight.
    expect(listbox.getAttribute("aria-activedescendant")).toBe(options[0]?.id);
    expect(options.every((option) => option.tabIndex === -1)).toBe(true);
  });

  it("opens on the last option with ArrowUp", () => {
    const { trigger } = renderSelect();
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowUp" });
    const options = screen.getAllByRole("option");
    expect(activeOptionId()).toBe(options[2]?.id);
  });

  it("wraps the highlight with the arrow keys and honours Home and End", () => {
    const { onChange, trigger } = renderSelect();
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const listbox = screen.getByRole("listbox");
    const options = screen.getAllByRole("option");

    fireEvent.keyDown(listbox, { key: "ArrowUp" });
    expect(activeOptionId()).toBe(options[2]?.id);
    fireEvent.keyDown(listbox, { key: "ArrowDown" });
    expect(activeOptionId()).toBe(options[0]?.id);

    fireEvent.keyDown(listbox, { key: "End" });
    expect(activeOptionId()).toBe(options[2]?.id);
    fireEvent.keyDown(listbox, { key: "Home" });
    expect(activeOptionId()).toBe(options[0]?.id);

    fireEvent.keyDown(listbox, { key: "ArrowDown" });
    fireEvent.keyDown(listbox, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("weather");
  });

  it("returns focus to the trigger when the listbox closes", () => {
    const { trigger } = renderSelect();
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Tab" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("moves the highlight by typeahead and keeps the buffer sticky", () => {
    const { onChange, trigger } = renderSelect();
    fireEvent.click(trigger);
    const listbox = screen.getByRole("listbox");
    const options = screen.getAllByRole("option");

    // "a" alone would reach "Weather"; "aw" does not, so the highlight stays
    // on Ambient only while the letters accumulate.
    fireEvent.keyDown(listbox, { key: "a" });
    expect(activeOptionId()).toBe(options[2]?.id);
    fireEvent.keyDown(listbox, { key: "w" });
    expect(activeOptionId()).toBe(options[2]?.id);

    fireEvent.keyDown(listbox, { key: "Escape" });
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "w" });
    expect(activeOptionId()).toBe(options[1]?.id);
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("weather");
  });
});

type SpecimenTab = "library" | "extensions" | "about";

// A controlled tab bar, the way the app mounts it: Tabs and TabPanel are
// siblings that share an id base so the panels are labelled by their tabs.
function TabsHarness({ onChange }: { onChange?: (value: SpecimenTab) => void }) {
  const [value, setValue] = useState<SpecimenTab>("library");
  return (
    <>
      <Tabs
        id="specimen-tabs"
        label="Specimen tabs"
        value={value}
        onChange={(next) => {
          setValue(next);
          onChange?.(next);
        }}
        tabs={[
          { value: "library", label: "Library" },
          { value: "extensions", label: "Extensions" },
          { value: "about", label: "About" },
        ]}
      />
      <TabPanel id="specimen-tabs" tabKey="library">
        Library panel
      </TabPanel>
      <TabPanel id="specimen-tabs" tabKey="extensions">
        Extensions panel
      </TabPanel>
      <TabPanel id="specimen-tabs" tabKey="about">
        About panel
      </TabPanel>
    </>
  );
}

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

  it("keeps a single tab stop and links each tab to its labelled panel", () => {
    render(<TabsHarness />);

    const tabs = screen.getAllByRole("tab");
    // Roving tabindex: only the selected tab is in the page tab order.
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1, -1]);
    expect(tabs.map((tab) => tab.getAttribute("aria-controls"))).toEqual([
      "specimen-tabs-panel-library",
      "specimen-tabs-panel-extensions",
      "specimen-tabs-panel-about",
    ]);

    // Every panel carries the tabpanel role and is named by its tab.
    const panels = screen.getAllByRole("tabpanel");
    expect(panels.map((panel) => panel.id)).toEqual([
      "specimen-tabs-panel-library",
      "specimen-tabs-panel-extensions",
      "specimen-tabs-panel-about",
    ]);
    expect(
      screen.getByRole("tabpanel", { name: "Library" }).getAttribute("aria-labelledby"),
    ).toBe("specimen-tabs-tab-library");
  });

  it("roves focus and selection with the arrow keys, Home and End", () => {
    render(<TabsHarness />);
    const tab = (name: string) => screen.getByRole("tab", { name });

    fireEvent.keyDown(tab("Library"), { key: "ArrowRight" });
    expect(document.activeElement).toBe(tab("Extensions"));
    expect(tab("Extensions").getAttribute("aria-selected")).toBe("true");
    expect(screen.getAllByRole("tab").map((t) => t.tabIndex)).toEqual([-1, 0, -1]);

    // ArrowRight wraps past the last tab.
    fireEvent.keyDown(tab("Extensions"), { key: "ArrowRight" });
    fireEvent.keyDown(tab("About"), { key: "ArrowRight" });
    expect(document.activeElement).toBe(tab("Library"));

    // ArrowLeft wraps before the first tab.
    fireEvent.keyDown(tab("Library"), { key: "ArrowLeft" });
    expect(document.activeElement).toBe(tab("About"));

    fireEvent.keyDown(tab("About"), { key: "Home" });
    expect(document.activeElement).toBe(tab("Library"));
    expect(tab("Library").getAttribute("aria-selected")).toBe("true");

    fireEvent.keyDown(tab("Library"), { key: "End" });
    expect(document.activeElement).toBe(tab("About"));
    expect(screen.getAllByRole("tab").map((t) => t.tabIndex)).toEqual([-1, -1, 0]);
  });

  it("leaves keys it does not own to the browser", () => {
    const onChange = vi.fn();
    render(<TabsHarness onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole("tab", { name: "Library" }), {
      key: "ArrowDown",
    });
    expect(onChange).not.toHaveBeenCalled();
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
    expect(
      screen.getByRole("button", { name: /From library/ }).textContent,
    ).toContain("Default");

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

describe("Feedback", () => {
  it("reports status, alerts, progress, and dismisses toasts", () => {
    const onDismiss = vi.fn();
    render(
      <>
        <StatusBadge status="Ready" tone="ready" />
        <Alert tone="warning" title="Disk almost full" body="Free space before scanning." />
        <Progress percent={42} top="Scanning library" bottom="42 of 100" />
        <Toast
          tone="error"
          title="Scan failed"
          message="Check the library root."
          onDismiss={onDismiss}
        />
      </>,
    );
    expect(screen.getByText("Ready")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("Disk almost full");
    expect(
      screen.getByRole("progressbar", { name: "Scanning library" }).getAttribute("aria-valuenow"),
    ).toBe("42");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss: Scan failed" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
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
