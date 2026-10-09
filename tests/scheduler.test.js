import test from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../src/db.js";
import { createPost } from "../src/repositories/posts.js";
import { claimSlot, getSlot } from "../src/repositories/slots.js";
import { getVariant } from "../src/repositories/variants.js";
import { listHistory } from "../src/repositories/attempts.js";
import { generateVariants } from "../src/services/variants.js";
import { approveVariant, scheduleVariant } from "../src/services/review.js";
import { createScheduler } from "../src/services/scheduler.js";
import { MockXPublisher } from "../src/adapters/mock.js";
import { listMockPosts } from "../src/adapters/mockStore.js";
import { SocialPublisher } from "../src/adapters/SocialPublisher.js";
import { PublishError } from "../src/adapters/PublishError.js";

const silent = { log() {}, error() {} };

const sample = {
  sourceType: "markdown",
  sourceUrl: null,
  title: "Scheduled posts",
  body: "# Scheduled posts\n\nA scheduled post goes out once at its time. A restarted worker never repeats it.",
};

class FlakyMock extends MockXPublisher {
  constructor(db, { failures, error }) {
    super(db);
    this.remaining = failures;
    this.error = error;
  }

  async publish(request) {
    if (this.remaining > 0) {
      this.remaining -= 1;
      throw this.error;
    }
    return super.publish(request);
  }
}

class Unverifiable extends SocialPublisher {
  constructor() {
    super("unverifiable");
    this.calls = 0;
  }

  async publish() {
    this.calls += 1;
    return { externalId: "unverifiable:1", preview: "post" };
  }
}

function setup(makePublisher = (db) => new MockXPublisher(db)) {
  const db = openDb(":memory:");
  const post = createPost(db, sample);
  const variants = generateVariants(db, post.id);
  const x = variants.find((variant) => variant.platform === "x");
  approveVariant(db, x.id);
  const { slot } = scheduleVariant(db, x.id, new Date(Date.now() + 120000).toISOString());
  const publisher = makePublisher(db);
  const registry = { forPlatform: () => publisher };
  const scheduler = createScheduler({ db, registry, logger: silent, staleClaimMs: 60000 });
  const due = new Date(Date.now() + 180000);
  return { db, x, slot, publisher, scheduler, due };
}

test("a slot that is not yet due is not published", async () => {
  const { db, slot, scheduler } = setup();
  await scheduler.tick(new Date());
  assert.equal(listMockPosts(db).length, 0);
  assert.equal(getSlot(db, slot.id).status, "pending");
});

test("a due slot is published once and later ticks do nothing", async () => {
  const { db, slot, x, scheduler, due } = setup();
  await scheduler.tick(due);
  await scheduler.tick(new Date(due.getTime() + 5000));
  assert.equal(listMockPosts(db).length, 1);
  assert.equal(getSlot(db, slot.id).status, "done");
  assert.equal(getVariant(db, x.id).status, "published");
  assert.equal(listHistory(db, 50).length, 1);
});

test("a crash after the platform accepted the post is recovered with no duplicate", async () => {
  const { db, slot, x, publisher, scheduler } = setup();
  claimSlot(db, slot.id);
  await publisher.publish({
    variantId: x.id,
    text: x.text,
    idempotencyKey: slot.idempotency_key,
  });
  const summary = await scheduler.recover(0, new Date(Date.now() + 1000));
  assert.equal(summary.recovered, 1);
  assert.equal(getSlot(db, slot.id).status, "done");
  assert.equal(getVariant(db, x.id).status, "published");
  assert.equal(listMockPosts(db).length, 1);
  assert.deepEqual(listHistory(db, 50).map((row) => row.result), ["success"]);
});

test("a crash before the platform call is released and then published once", async () => {
  const { db, slot, scheduler, due } = setup();
  claimSlot(db, slot.id);
  const summary = await scheduler.recover(0, new Date(Date.now() + 1000));
  assert.equal(summary.released, 1);
  assert.equal(getSlot(db, slot.id).status, "pending");
  await scheduler.tick(due);
  assert.equal(listMockPosts(db).length, 1);
  assert.deepEqual(listHistory(db, 50).map((row) => row.result), ["success"]);
});

test("an adapter that cannot verify fails the slot after a crash instead of risking a duplicate", async () => {
  const { db, slot, publisher, scheduler, due } = setup(() => new Unverifiable());
  claimSlot(db, slot.id);
  const summary = await scheduler.recover(0, new Date(Date.now() + 1000));
  assert.equal(summary.failed, 1);
  assert.equal(getSlot(db, slot.id).status, "failed");
  await scheduler.tick(due);
  assert.equal(publisher.calls, 0);
  assert.deepEqual(listHistory(db, 50).map((row) => row.result), ["failed"]);
});

test("a retryable failure is delayed by the retry-after wait and tried again later", async () => {
  const error = new PublishError("rate limit", { retryable: true, retryAfterMs: 5000 });
  const { db, slot, scheduler, due } = setup(
    (database) => new FlakyMock(database, { failures: 1, error })
  );
  const first = await scheduler.tick(due);
  assert.equal(first.results[0].outcome, "retry");
  const waiting = getSlot(db, slot.id);
  assert.equal(waiting.status, "pending");
  assert.ok(waiting.retry_at >= new Date(due.getTime() + 5000).toISOString());

  const tooEarly = await scheduler.tick(new Date(due.getTime() + 1000));
  assert.equal(tooEarly.results.length, 0);
  assert.equal(listMockPosts(db).length, 0);

  const later = await scheduler.tick(new Date(due.getTime() + 70000));
  assert.equal(later.results[0].outcome, "published");
  assert.equal(listMockPosts(db).length, 1);
});

test("recovery leaves fresh claims alone", async () => {
  const { db, slot, scheduler } = setup();
  claimSlot(db, slot.id);
  const summary = await scheduler.recover(60000, new Date());
  assert.deepEqual(summary, { recovered: 0, released: 0, failed: 0 });
  assert.equal(getSlot(db, slot.id).status, "claimed");
});
