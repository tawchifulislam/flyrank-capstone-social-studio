import { getVariant } from "../repositories/variants.js";
import {
  finishSlot,
  listClaimedBefore,
  listDueSlots,
  releaseSlot,
  setRetryAt,
} from "../repositories/slots.js";
import { countFailedAttempts, recordAttempt } from "../repositories/attempts.js";
import { finalizeSuccess, publishSlot } from "./publisher.js";

const MAX_BACKOFF_MS = 60000;

const UNVERIFIABLE_AFTER_CRASH =
  "worker stopped during publish, the outcome is unknown and the adapter cannot verify it, not retried to avoid a duplicate post";

export function computeDelayMs(failures, retryAfterMs) {
  const base = Math.min(1000 * 2 ** Math.max(failures - 1, 0), MAX_BACKOFF_MS);
  const jitter = Math.floor(Math.random() * base * 0.2);
  return Math.max(base + jitter, retryAfterMs ?? 0);
}

export function createScheduler({
  db,
  registry,
  intervalMs = 5000,
  staleClaimMs = 60000,
  batchSize = 10,
  logger = console,
}) {
  let timer = null;
  let stopped = true;
  let inFlight = Promise.resolve();

  async function recover(olderThanMs = staleClaimMs, now = new Date()) {
    const cutoff = new Date(now.getTime() - olderThanMs).toISOString();
    const summary = { recovered: 0, released: 0, failed: 0 };

    for (const slot of listClaimedBefore(db, cutoff)) {
      try {
        const variant = getVariant(db, slot.variant_id);
        const publisher = registry.forPlatform(variant.platform);
        const found = await publisher.lookup(slot.idempotency_key);

        if (found) {
          finalizeSuccess(db, slot, variant, slot.idempotency_key, found);
          summary.recovered += 1;
          logger.log(`slot ${slot.id} recovered as published`);
        } else if (found === null) {
          releaseSlot(db, slot.id);
          summary.released += 1;
          logger.log(`slot ${slot.id} released for retry`);
        } else {
          recordAttempt(db, {
            slotId: slot.id,
            variantId: variant.id,
            platform: variant.platform,
            idempotencyKey: slot.idempotency_key,
            result: "failed",
            error: UNVERIFIABLE_AFTER_CRASH,
          });
          finishSlot(db, slot.id, "failed");
          summary.failed += 1;
          logger.log(`slot ${slot.id} marked failed after a crash`);
        }
      } catch (error) {
        logger.error(`slot ${slot.id} recovery failed: ${error.message}`);
      }
    }
    return summary;
  }

  async function tick(now = new Date()) {
    const recovery = await recover(staleClaimMs, now);
    const results = [];

    for (const slot of listDueSlots(db, now.toISOString(), batchSize)) {
      try {
        const result = await publishSlot(db, registry, slot.id);
        if (result.outcome === "retry") {
          const failures = countFailedAttempts(db, slot.id);
          const delay = computeDelayMs(failures, result.retryAfterMs);
          setRetryAt(db, slot.id, new Date(now.getTime() + delay).toISOString());
        }
        results.push(result);
        logger.log(`slot ${slot.id}: ${result.outcome}`);
      } catch (error) {
        logger.error(`slot ${slot.id} failed unexpectedly: ${error.message}`);
      }
    }
    return { recovery, results };
  }

  async function runTick() {
    try {
      await tick();
    } catch (error) {
      logger.error(`scheduler tick failed: ${error.message}`);
    }
  }

  function schedule() {
    if (stopped) return;
    timer = setTimeout(async () => {
      inFlight = runTick();
      await inFlight;
      schedule();
    }, intervalMs);
  }

  async function start() {
    stopped = false;
    try {
      const summary = await recover(0);
      logger.log(
        `scheduler started, recovered ${summary.recovered}, released ${summary.released}, failed ${summary.failed}`
      );
    } catch (error) {
      logger.error(`startup recovery failed: ${error.message}`);
    }
    inFlight = runTick();
    await inFlight;
    schedule();
  }

  async function stop() {
    stopped = true;
    clearTimeout(timer);
    await inFlight;
  }

  return { tick, recover, start, stop };
}
