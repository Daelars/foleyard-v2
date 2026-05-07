export class YardCoreError extends Error {
  constructor(message: string, readonly code = "YARD_CORE_ERROR") {
    super(message);
    this.name = "YardCoreError";
  }
}
