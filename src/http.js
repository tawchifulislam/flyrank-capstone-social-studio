import { HttpError } from "./errors.js";

export function parseId(value, name) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) {
    throw new HttpError(400, `${name} must be a positive integer`);
  }
  return id;
}
