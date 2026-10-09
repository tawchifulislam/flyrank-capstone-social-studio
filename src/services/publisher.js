import { HttpError } from "../errors.js";
import { PublishError } from "../adapters/PublishError.js";
import { getVariant, transitionVariant } from "../repositories/variants.js";
import { claimSlot, finishSlot, getSlot, releaseSlot } from "../repositories/slots.js";
import {
  countFailedAttempts,
  findSuccessByKey,
  lastAttemptForSlot,
  recordAttempt,
} from "../repositories/attempts.js";

export const MAX_ATTEMPTS = 3;

const UNVERIFIABLE_MESSAGE =
  "earlier attempt outcome is unknown and the adapter cannot verify it, not retried to avoid a duplicate post";

function describe(slot, extra) {
  return { slotId: slot.id, variantId: slot.variant_id, ...extra };
}

function finalizeSuccess(db, slot, variant, key, { externalId, preview }) {
  db.exec("BEGIN");
  try {
    recordAttempt(db, {
      slotId: slot.id,
      variantId: variant.id,
      platform: variant.platform,
      idempotencyKey: key,
      result: "success",
      externalId,
    });
    finishSlot(db, slot.id, "done");
    transitionVariant(db, variant.id, ["approved"], "published");
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return describe(slot, { outcome: "published", externalId, preview });
}

function handleFailure(db, slot, variant, key, error) {
  const publishError =
    error instanceof PublishError
      ? error
      : new PublishError("publisher threw an unexpected error", {
          retryable: false,
          ambiguous: true,
        });

  recordAttempt(db, {
    slotId: slot.id,
    variantId: variant.id,
    platform: variant.platform,
    idempotencyKey: key,
    result: publishError.ambiguous ? "unknown" : "failed",
    error: publishError.message,
  });

  const failures = countFailedAttempts(db, slot.id);
  if (!publishError.retryable || failures >= MAX_ATTEMPTS) {
    finishSlot(db, slot.id, "failed");
    return describe(slot, { outcome: "failed", error: publishError.message });
  }

  releaseSlot(db, slot.id);
  return describe(slot, {
    outcome: "retry",
    error: publishError.message,
    retryAfterMs: publishError.retryAfterMs,
    ambiguous: publishError.ambiguous,
  });
}

export async function publishSlot(db, registry, slotId) {
  const slot = getSlot(db, slotId);
  if (!slot) {
    throw new HttpError(404, "slot not found");
  }
  const variant = getVariant(db, slot.variant_id);
  const key = slot.idempotency_key;

  const existing = findSuccessByKey(db, key);
  if (existing) {
    recordAttempt(db, {
      slotId: slot.id,
      variantId: variant.id,
      platform: variant.platform,
      idempotencyKey: key,
      result: "duplicate_ignored",
      externalId: existing.external_id,
    });
    return describe(slot, {
      outcome: "already_published",
      externalId: existing.external_id,
    });
  }

  if (variant.status !== "approved") {
    return describe(slot, {
      outcome: "not_approved",
      error: `variant is ${variant.status}`,
    });
  }

  const publisher = registry.forPlatform(variant.platform);

  if (!claimSlot(db, slot.id)) {
    const current = getSlot(db, slot.id);
    return describe(slot, {
      outcome: current.status === "claimed" ? "in_progress" : "not_pending",
      error: `slot is ${current.status}`,
    });
  }

  const last = lastAttemptForSlot(db, slot.id);
  if (last && last.result === "unknown") {
    const found = await publisher.lookup(key);
    if (found) {
      return finalizeSuccess(db, slot, variant, key, found);
    }
    if (found === undefined) {
      recordAttempt(db, {
        slotId: slot.id,
        variantId: variant.id,
        platform: variant.platform,
        idempotencyKey: key,
        result: "failed",
        error: UNVERIFIABLE_MESSAGE,
      });
      finishSlot(db, slot.id, "failed");
      return describe(slot, { outcome: "failed", error: UNVERIFIABLE_MESSAGE });
    }
  }

  let result;
  try {
    result = await publisher.publish({
      variantId: variant.id,
      platform: variant.platform,
      text: variant.text,
      idempotencyKey: key,
    });
  } catch (error) {
    return handleFailure(db, slot, variant, key, error);
  }

  return finalizeSuccess(db, slot, variant, key, result);
}
