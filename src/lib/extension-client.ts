export type ExtensionExecuteRequest = {
  extensionId: string;
  commandId: string;
  selection?: {
    fileIds?: string[];
    folderPath?: string;
    collectionId?: string;
  };
  input?: unknown;
  destinationGrant?: string;
};

export async function executeExtensionCommand<T>(
  body: ExtensionExecuteRequest,
): Promise<T> {
  const response = await fetch("/api/extensions/execute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json()) as {
    ok?: boolean;
    type?: string;
    value?: T;
    message?: unknown;
    error?: unknown;
  };

  if (!response.ok || data?.ok === false) {
    throw new Error(readFailureMessage(data));
  }

  return (data?.type === "value" ? data.value : data) as T;
}

function readFailureMessage(data: {
  message?: unknown;
  error?: unknown;
}): string {
  if (typeof data?.message === "string" && data.message) {
    return data.message;
  }

  if (typeof data?.error === "string" && data.error) {
    return data.error;
  }

  return "Extension command failed";
}
