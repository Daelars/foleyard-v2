import { getAllCollections, getAllTags, getFileById } from "@/lib/db";
import { ApiError } from "./errors";

export async function readMutationBody(request: Request, references = true) {
  const body = await request.json();
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError("Request body must be an object");
  for (const key of ["id", "fileId", "tagId", "collectionId", "name", "action"]) {
    if (body[key] !== undefined && (typeof body[key] !== "string" || !body[key].trim())) throw new ApiError(key + " must be a non-empty string");
  }
  if (body.fileIds !== undefined && (!Array.isArray(body.fileIds) || body.fileIds.some((id: unknown) => typeof id !== "string" || !id))) throw new ApiError("fileIds must be string[]");
  if (body.isSmart !== undefined && typeof body.isSmart !== "boolean") throw new ApiError("isSmart must be a boolean");
  if (body.permanent !== undefined && typeof body.permanent !== "boolean") throw new ApiError("permanent must be a boolean");
  if (body.filter !== undefined && body.filter !== null && typeof body.filter !== "string") throw new ApiError("filter must be a string or null");
  if (references) {
    for (const id of [body.id, body.fileId]) if (id && !getFileById(id)) throw new ApiError("File does not exist", 404);
    if (body.tagId && !getAllTags().some(tag => tag.id === body.tagId)) throw new ApiError("Tag does not exist", 404);
    if (body.collectionId && !getAllCollections().some(collection => collection.id === body.collectionId)) throw new ApiError("Collection does not exist", 404);
  }
  return body;
}
