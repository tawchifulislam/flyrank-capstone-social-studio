import { HttpError } from "../errors.js";
import {
  getVariant,
  transitionVariant,
  updateVariantText,
} from "../repositories/variants.js";
import {
  createSlot,
  deletePendingSlotsForVariant,
  getSlotByKey,
  getSlotByVariant,
} from "../repositories/slots.js";
import { assertVariantValid } from "./validation.js";

const MAX_REASON_LENGTH = 500;

export function getVariantById(db, id) {
  const variant = getVariant(db, id);
  if (!variant) {
    throw new HttpError(404, "variant not found");
  }
  return variant;
}

export function approveVariant(db, id) {
  const variant = getVariantById(db, id);
  if (variant.status !== "draft") {
    throw new HttpError(
      409,
      `only draft variants can be approved, this one is ${variant.status}`
    );
  }
  assertVariantValid(variant.platform, variant.text);
  if (!transitionVariant(db, id, ["draft"], "approved")) {
    throw new HttpError(409, "variant changed, try again");
  }
  return getVariant(db, id);
}

export function rejectVariant(db, id, reason) {
  const variant = getVariantById(db, id);
  if (reason !== undefined && (typeof reason !== "string" || reason.length > MAX_REASON_LENGTH)) {
    throw new HttpError(400, `reason must be a string of at most ${MAX_REASON_LENGTH} characters`);
  }
  if (variant.status !== "draft") {
    throw new HttpError(
      409,
      `only draft variants can be rejected, this one is ${variant.status}`
    );
  }
  if (!transitionVariant(db, id, ["draft"], "rejected", reason ?? null)) {
    throw new HttpError(409, "variant changed, try again");
  }
  return getVariant(db, id);
}

export function editVariant(db, id, text) {
  const variant = getVariantById(db, id);
  if (variant.status === "published") {
    throw new HttpError(409, "published variants cannot be edited");
  }
  assertVariantValid(variant.platform, text);
  const slot = getSlotByVariant(db, id);
  if (slot && slot.status !== "pending") {
    throw new HttpError(409, `variant has a ${slot.status} slot and cannot be edited`);
  }
  db.exec("BEGIN");
  try {
    deletePendingSlotsForVariant(db, id);
    if (!updateVariantText(db, id, text, ["draft", "approved", "rejected"])) {
      throw new HttpError(409, "variant changed, try again");
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return getVariant(db, id);
}

function parseScheduledAt(value) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new HttpError(400, "scheduledAt must be an ISO 8601 timestamp");
  }
  if (!/(Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw new HttpError(400, "scheduledAt must include a timezone offset or Z");
  }
  const date = new Date(value);
  if (date.getTime() <= Date.now()) {
    throw new HttpError(422, "scheduledAt must be in the future");
  }
  return date.toISOString();
}

export function scheduleVariant(db, id, scheduledAtInput) {
  const variant = getVariantById(db, id);
  if (variant.status !== "approved") {
    throw new HttpError(
      409,
      `only approved variants can be scheduled, this one is ${variant.status}`
    );
  }
  assertVariantValid(variant.platform, variant.text);
  const scheduledAt = parseScheduledAt(scheduledAtInput);

  const existing = getSlotByVariant(db, id);
  if (existing) {
    if (existing.scheduled_at === scheduledAt) {
      return { slot: existing, created: false };
    }
    throw new HttpError(
      409,
      `variant is already scheduled for ${existing.scheduled_at}`
    );
  }

  const idempotencyKey = `variant:${id}:${scheduledAt}`;
  try {
    const slot = createSlot(db, { variantId: id, scheduledAt, idempotencyKey });
    return { slot, created: true };
  } catch (error) {
    if (String(error.message).includes("UNIQUE constraint failed")) {
      return { slot: getSlotByKey(db, idempotencyKey), created: false };
    }
    throw error;
  }
}
