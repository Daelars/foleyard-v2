import type { YardExtensionContext } from "yard-core";

export function createService(context: YardExtensionContext) {
  return new ExampleExtensionService(context);
}

export class ExampleExtensionService {
  constructor(private context: YardExtensionContext) {}

  async run() {
    this.context.permissions.require("library:read");

    const selectedIds = this.context.selection.fileIds;

    return {
      selectedIds,
      message: "Example extension ran successfully."
    };
  }
}
