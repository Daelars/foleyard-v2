// @vitest-environment jsdom
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { toast } from "sonner";

import { useCollections } from "@/app/library/use-collections";
import { useTags } from "@/app/library/use-tags";
import { V3SettingsMetadataTab } from "@/app/(variant-i)/components/settings/metadata-tab";
import { V3SettingsLibraryTab } from "@/app/(variant-i)/components/settings/library-tab";
import { V3OrganizeView } from "@/app/(variant-i)/components/organize";
import { ITEM_COLOR_PRESETS } from "@/lib/item-colors";
import { emptyScanStatus } from "@/lib/scanner/types";

// Area: #293. A create reports success only once the durable change lands. A
// failed request keeps the user's draft, explains recovery, and never shows a
// success toast or a phantom row; a lost response that actually persisted is
// reconciled against the refreshed list and resynchronizes the draft.

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

type JsonResponse = { ok: boolean; status: number; json: () => Promise<unknown> };
const okJson = (data: unknown): JsonResponse => ({
  ok: true,
  status: 200,
  json: async () => data,
});
const errJson = (data: unknown, status = 500): JsonResponse => ({
  ok: false,
  status,
  json: async () => data,
});

type FetchCall = { url: string; init?: RequestInit };

/** Fetch stub keyed by `METHOD url`; unmatched routes throw loudly. */
function stubFetch(routes: Record<string, () => Promise<JsonResponse>>) {
  const calls: FetchCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      const method = init?.method ?? "GET";
      const handler = routes[`${method} ${url}`];
      if (!handler) throw new Error(`unexpected ${method} ${url}`);
      return handler();
    }),
  );
  return calls;
}

const noopCallbacks = {
  isCollectionSelected: () => false,
  onSelectedCollectionGone: () => {},
  onSelectedCollectionRestored: () => {},
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("collection and tag create lifecycle", () => {
  it("posts a Collection name and colour in one request and confirms only then", async () => {
    const calls = stubFetch({
      "POST /api/collections": async () => okJson({ success: true, id: "c1" }),
      "GET /api/collections": async () => okJson({ collections: [] }),
    });
    const { result } = renderHook(() => useCollections(noopCallbacks));

    let created: string | null = null;
    await act(async () => {
      created = await result.current.createCollection("Impacts", "#f0503c");
    });

    expect(created).toBe("c1");
    const posts = calls.filter((call) => (call.init?.method ?? "GET") === "POST");
    expect(posts).toHaveLength(1);
    expect(JSON.parse(String(posts[0].init?.body))).toEqual({
      name: "Impacts",
      color: "#f0503c",
    });
    expect(
      calls.some((call) => (call.init?.method ?? "GET") === "PATCH"),
      "no follow-up colour write that could fail after a success toast",
    ).toBe(false);
    expect(toast.success).toHaveBeenCalledWith("Collection created");
  });

  it("keeps a failed Collection create honest: server message, refetch, no success, no row", async () => {
    const calls = stubFetch({
      "POST /api/collections": async () =>
        errJson({ error: "The library database is read-only" }),
      "GET /api/collections": async () => okJson({ collections: [] }),
    });
    const { result } = renderHook(() => useCollections(noopCallbacks));

    let created: string | null = "pending";
    await act(async () => {
      created = await result.current.createCollection("Impacts", "#f0503c");
    });

    expect(created).toBeNull();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("The library database is read-only");
    expect(
      calls.some(
        (call) =>
          call.url === "/api/collections" &&
          (call.init?.method ?? "GET") === "GET",
      ),
      "a failed create reconciles with the server",
    ).toBe(true);
    expect(
      result.current.collections.some((entry) => entry.name === "Impacts"),
      "a failed create must not leave a phantom row",
    ).toBe(false);
  });

  it("reconciles a lost Collection response that actually persisted", async () => {
    stubFetch({
      "POST /api/collections": async () => {
        throw new Error("network down");
      },
      // The refresh reveals the write landed even though the response was lost.
      "GET /api/collections": async () =>
        okJson({ collections: [{ id: "c9", name: "Impacts", color: "#f0503c" }] }),
    });
    const { result } = renderHook(() => useCollections(noopCallbacks));

    let created: string | null = null;
    await act(async () => {
      created = await result.current.createCollection("Impacts", "#f0503c");
    });

    expect(created, "the durable create is confirmed, so the draft resets").toBe(
      "c9",
    );
    expect(toast.success).toHaveBeenCalledWith("Collection created");
    expect(toast.error).not.toHaveBeenCalled();
    expect(result.current.collections.map((entry) => entry.name)).toEqual([
      "Impacts",
    ]);
  });

  it("posts a Tag name and colour in one request and confirms only then", async () => {
    const calls = stubFetch({
      "POST /api/tags": async () => okJson({ success: true, id: "t1" }),
      "GET /api/tags": async () => okJson({ tags: [] }),
    });
    const { result } = renderHook(() => useTags());

    let created: string | null = null;
    await act(async () => {
      created = await result.current.createTag("Loud", "#7ab8ff");
    });

    expect(created).toBe("t1");
    const posts = calls.filter((call) => (call.init?.method ?? "GET") === "POST");
    expect(posts).toHaveLength(1);
    expect(JSON.parse(String(posts[0].init?.body))).toEqual({
      name: "Loud",
      color: "#7ab8ff",
    });
    expect(
      calls.some((call) => (call.init?.method ?? "GET") === "PATCH"),
    ).toBe(false);
    expect(toast.success).toHaveBeenCalledWith("Tag created");
  });

  it("keeps a failed Tag create honest: error toast only, refetch, no row", async () => {
    const calls = stubFetch({
      "POST /api/tags": async () => errJson({ error: "That name already exists" }, 409),
      "GET /api/tags": async () => okJson({ tags: [] }),
    });
    const { result } = renderHook(() => useTags());

    let created: string | null = "pending";
    await act(async () => {
      created = await result.current.createTag("Loud", "#7ab8ff");
    });

    expect(created).toBeNull();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("That name already exists");
    expect(
      calls.some(
        (call) => call.url === "/api/tags" && (call.init?.method ?? "GET") === "GET",
      ),
    ).toBe(true);
    expect(result.current.tags).toHaveLength(0);
  });
});

describe("draft preservation in settings", () => {
  it("keeps a Collection draft when creation fails and clears it on success", async () => {
    const onCreateCollection = vi
      .fn<(name: string, color?: string) => Promise<string | null>>()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("c1");
    const onCreateTag = vi.fn(async () => null as string | null);

    const props = {
      collections: [],
      tags: [],
      onCreateCollection,
      onDeleteCollection: vi.fn(async () => {}),
      onCreateTag,
      onDeleteTag: vi.fn(async () => {}),
    };
    render(<V3SettingsMetadataTab {...props} />);

    const input = screen.getByLabelText("Collection name") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Impacts" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(onCreateCollection).toHaveBeenCalledWith("Impacts"));
    expect(input.value, "the failed draft is kept for retry").toBe("Impacts");
    expect(toast.success).not.toHaveBeenCalled();

    // Retry: the second attempt persists (or reconciles), so the draft resets.
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(input.value).toBe(""));
  });

  it("resynchronizes a Collection draft when a refresh reveals it persisted", async () => {
    const onCreateCollection = vi.fn(async () => null as string | null);
    const baseProps = {
      tags: [],
      onCreateCollection,
      onDeleteCollection: vi.fn(async () => {}),
      onCreateTag: vi.fn(async () => null as string | null),
      onDeleteTag: vi.fn(async () => {}),
    };

    const { rerender } = render(
      <V3SettingsMetadataTab {...baseProps} collections={[]} />,
    );
    const input = screen.getByLabelText("Collection name") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Impacts" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(onCreateCollection).toHaveBeenCalled());
    expect(input.value).toBe("Impacts");

    // A later external refresh shows the collection; the local draft must
    // resynchronize rather than repeat a duplicate.
    rerender(
      <V3SettingsMetadataTab
        {...baseProps}
        collections={[{ id: "c1", name: "Impacts" }]}
      />,
    );
    await waitFor(() => expect(input.value).toBe(""));
  });

  it("keeps a Library path when saving fails and clears it when it lands", async () => {
    const calls = stubFetch({
      "POST /api/settings": async () =>
        okJson({
          valid: true,
          normalizedPath: "/lib",
          readable: true,
          audioFileCount: 3,
          samples: [],
          error: null,
        }),
    });
    const onSaveRoot = vi
      .fn<(path: string) => Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    render(
      <V3SettingsLibraryTab
        settings={{
          libraryRoot: null,
          libraryRoots: [],
          stats: { activeFiles: 0, removedFiles: 0 },
        }}
        onSaveRoot={onSaveRoot}
        onRemoveRoot={vi.fn(async () => {})}
        scanStatus={emptyScanStatus}
        onStartScan={vi.fn(async () => true)}
      />,
    );

    const input = screen.getByPlaceholderText(/Samples/) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "/lib" } });
    fireEvent.click(screen.getByRole("button", { name: /Add Folder/ }));

    await waitFor(() => expect(onSaveRoot).toHaveBeenCalledWith("/lib"));
    expect(input.value, "the entered path is kept so the user can retry").toBe("/lib");
    expect(toast.success).not.toHaveBeenCalled();
    expect(calls.some((call) => call.url === "/api/settings")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /Add Folder/ }));
    await waitFor(() => expect(input.value).toBe(""));
    expect(toast.success).toHaveBeenCalledWith("Library folder added");
  });
});

describe("draft preservation in the organize composer", () => {
  function renderOrganize(
    onCreateCollection: (name: string, color: string) => Promise<string | null>,
  ) {
    render(
      <V3OrganizeView
        collections={[]}
        tags={[]}
        selectedTagId={null}
        smartCounts={{}}
        onOpenCollection={() => {}}
        onCreateCollection={onCreateCollection}
        onRenameCollection={async () => {}}
        onDeleteCollection={() => {}}
        onUpdateCollectionColor={() => {}}
        onCreateTag={async () => null}
        onRenameTag={async () => {}}
        onDeleteTag={() => {}}
        onUpdateTagColor={() => {}}
        onSelectTag={() => {}}
      />,
    );
  }

  it("keeps the name and colour when a Collection create fails", async () => {
    const onCreateCollection = vi.fn(async () => null as string | null);
    renderOrganize(onCreateCollection);

    fireEvent.click(screen.getByRole("button", { name: /New collection/ }));
    const input = screen.getByLabelText("New collection name") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Impacts" } });

    const chosen = ITEM_COLOR_PRESETS[3];
    fireEvent.click(screen.getByLabelText(`Pick ${chosen}`));
    fireEvent.click(screen.getByRole("button", { name: /Create collection/ }));

    await waitFor(() =>
      expect(onCreateCollection).toHaveBeenCalledWith("Impacts", chosen),
    );
    // The composer stays open with both halves of the draft intact.
    const stillOpen = screen.getByLabelText("New collection name") as HTMLInputElement;
    expect(stillOpen.value).toBe("Impacts");
    expect(
      screen.getByLabelText(`Pick ${chosen}`).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("resets the composer once the create is confirmed", async () => {
    const onCreateCollection = vi.fn(async () => "c1" as string | null);
    renderOrganize(onCreateCollection);

    fireEvent.click(screen.getByRole("button", { name: /New collection/ }));
    const input = screen.getByLabelText("New collection name") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Impacts" } });
    fireEvent.click(screen.getByRole("button", { name: /Create collection/ }));

    await waitFor(() =>
      expect(screen.queryByLabelText("New collection name")).toBeNull(),
    );
  });
});
