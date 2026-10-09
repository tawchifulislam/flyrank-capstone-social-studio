import test from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../src/db.js";
import { createPost } from "../src/repositories/posts.js";
import { getSlot } from "../src/repositories/slots.js";
import { getVariant } from "../src/repositories/variants.js";
import { listHistory } from "../src/repositories/attempts.js";
import { generateVariants } from "../src/services/variants.js";
import { approveVariant, scheduleVariant } from "../src/services/review.js";
import { MAX_ATTEMPTS, publishSlot } from "../src/services/publisher.js";
import { MockXPublisher } from "../src/adapters/mock.js";
import { listMockPosts } from "../src/adapters/mockStore.js";
import { SocialPublisher } from "../src/adapters/SocialPublisher.js";
import { PublishError } from "../src/adapters/PublishError.js";

const sample = {
  sourceType: "markdown",
  sourceUrl: null,
  title: "Idempotency in practice",
  body: "# Idempotency in practice\n\nA retry must never create a second post. A unique key per variant and slot stops duplicates.",
};

class FlakyMock extends MockXPublisher {
  constructor(db, { failures, postFirst, error }) {
    super(db);
    this.remaining = failures;
    this.postFirst = postFirst;
    this.error = error;
  }

  async publish(request) {
    if (this.remaining > 0) {
      this.remaining -= 1;
      if (this.postFirst) {
        await super.publish(request);
      }
      throw this.error;
    }
    return super.publish(request);
  }
}

class UnverifiableFailing extends SocialPublisher {
  constructor() {
    super("unverifiable");
    this.calls = 0;
  }

  async publish() {
    this.calls += 1;
    throw new PublishError("timeout", { retryable: true, ambiguous: true });
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
  return { db, slot, x, publisher, registry };
}

test("a published slot posts once, marks the slot done and the variant published", async () => {
  const { db, slot, x, registry } = setup();
  const result = await publishSlot(db, registry, slot.id);
  assert.equal(result.outcome, "published");
  assert.equal(listMockPosts(db).length, 1);
  assert.equal(getSlot(db, slot.id).status, "done");
  assert.equal(getVariant(db, x.id).status, "published");
});

test("publishing the same slot again posts nothing and is recorded as duplicate_ignored", async () => {
  const { db, slot, registry } = setup();
  await publishSlot(db, registry, slot.id);
  const again = await publishSlot(db, registry, slot.id);
  assert.equal(again.outcome, "already_published");
  assert.equal(listMockPosts(db).length, 1);
  const results = listHistory(db, 50).map((row) => row.result).sort();
  assert.deepEqual(results, ["duplicate_ignored", "success"]);
});

test("concurrent publish calls for one slot produce a single post", async () => {
  const { db, slot, registry } = setup();
  const outcomes = await Promise.all(
    Array.from({ length: 5 }, () => publishSlot(db, registry, slot.id))
  );
  assert.equal(listMockPosts(db).length, 1);
  assert.equal(outcomes.filter((item) => item.outcome === "published").length, 1);
});

test("a timeout after the platform accepted the post is resolved by lookup, not by posting again", async () => {
  const error = new PublishError("timeout after send", { retryable: true, ambiguous: true });
  const { db, slot, x, registry } = setup(
    (database) => new FlakyMock(database, { failures: 1, postFirst: true, error })
  );
  const first = await publishSlot(db, registry, slot.id);
  assert.equal(first.outcome, "retry");
  assert.equal(getSlot(db, slot.id).status, "pending");
  const second = await publishSlot(db, registry, slot.id);
  assert.equal(second.outcome, "published");
  assert.equal(listMockPosts(db).length, 1);
  assert.equal(getVariant(db, x.id).status, "published");
  const results = listHistory(db, 50).map((row) => row.result).sort();
  assert.deepEqual(results, ["success", "unknown"]);
});

test("an unknown outcome on an adapter that cannot verify is not retried", async () => {
  const { db, slot, publisher, registry } = setup(() => new UnverifiableFailing());
  const first = await publishSlot(db, registry, slot.id);
  assert.equal(first.outcome, "retry");
  const second = await publishSlot(db, registry, slot.id);
  assert.equal(second.outcome, "failed");
  assert.equal(publisher.calls, 1);
  assert.equal(getSlot(db, slot.id).status, "failed");
});

test("a rate limited attempt is released for retry and publishes later", async () => {
  const error = new PublishError("rate limit", { retryable: true, retryAfterMs: 1000 });
  const { db, slot, registry } = setup(
    (database) => new FlakyMock(database, { failures: 1, postFirst: false, error })
  );
  const first = await publishSlot(db, registry, slot.id);
  assert.equal(first.outcome, "retry");
  assert.equal(first.retryAfterMs, 1000);
  const second = await publishSlot(db, registry, slot.id);
  assert.equal(second.outcome, "published");
  assert.equal(listMockPosts(db).length, 1);
});

test("attempts stop at the maximum and the slot is marked failed", async () => {
  const error = new PublishError("rate limit", { retryable: true, retryAfterMs: 1 });
  const { db, slot, registry } = setup(
    (database) => new FlakyMock(database, { failures: 99, postFirst: false, error })
  );
  for (let i = 0; i < MAX_ATTEMPTS - 1; i += 1) {
    const result = await publishSlot(db, registry, slot.id);
    assert.equal(result.outcome, "retry");
  }
  const last = await publishSlot(db, registry, slot.id);
  assert.equal(last.outcome, "failed");
  assert.equal(getSlot(db, slot.id).status, "failed");
  assert.equal(listMockPosts(db).length, 0);
});

test("an unapproved variant is not published", async () => {
  const { db, slot, x, registry } = setup();
  db.prepare("UPDATE variants SET status = 'draft' WHERE id = ?").run(x.id);
  const result = await publishSlot(db, registry, slot.id);
  assert.equal(result.outcome, "not_approved");
  assert.equal(listMockPosts(db).length, 0);
});
