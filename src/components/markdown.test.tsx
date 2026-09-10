// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Markdown } from "./markdown";

// Area: #250. The docs browser rewrites relative document links; everything
// else renders unchanged.

describe("Markdown links", () => {
  it("rewrites relative document links through the resolver", () => {
    render(
      <Markdown
        text="See [Settings](settings.md) and [pipeline](../settings.md#top)."
        linkFor={(href) =>
          href === "settings.md"
            ? "/docs/settings"
            : href === "../settings.md#top"
              ? "/docs/settings#top"
              : null
        }
      />,
    );
    expect(screen.getByRole("link", { name: "Settings" }).getAttribute("href")).toBe(
      "/docs/settings",
    );
    expect(screen.getByRole("link", { name: "pipeline" }).getAttribute("href")).toBe(
      "/docs/settings#top",
    );
  });

  it("leaves external and anchor links unchanged", () => {
    render(
      <Markdown
        text="[Site](https://example.com/docs) and [Section](#renderer)."
        linkFor={() => null}
      />,
    );
    const site = screen.getByRole("link", { name: "Site" });
    expect(site.getAttribute("href")).toBe("https://example.com/docs");
    expect(site.getAttribute("target")).toBe("_blank");
    expect(screen.getByRole("link", { name: "Section" }).getAttribute("href")).toBe(
      "#renderer",
    );
  });
});
