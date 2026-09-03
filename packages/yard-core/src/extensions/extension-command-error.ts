import { YardCoreError } from "../errors/yard-core-error";

export class YardCommandValidationError extends YardCoreError {
  constructor(message: string) {
    super(message, "EXTENSION_COMMAND_VALIDATION_FAILED");
    this.name = "YardCommandValidationError";
  }
}
