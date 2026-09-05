import { expect, it } from "vitest";
import { immediateSubdirectories } from "../browse-repository";
it("uses the same separator normalization for parent and child directories",()=>{
  expect(immediateSubdirectories(["foley\\wood\\hits", "foley/wood/scrapes", "foley/metal"],"foley\\wood")).toEqual(["foley/wood/hits","foley/wood/scrapes"]);
  expect(immediateSubdirectories(["foley\\wood","foley/metal"],null)).toEqual(["foley"]);
});
