import test from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../src/db.js";
import { createPost } from "../src/repositories/posts.js";
import { generateVariants, createManualVariant } from "../src/services/variants.js";
import { validateVariant } from "../src/services/validation.js";

const sample = {
  sourceType: "markdown",
  sourceUrl: null,
  title: "Idempotency in practice",
  body: "# Idempotency in practice\n\nA retry must never create a second post, even when the first request timed out after the platform accepted it. The fix is a unique key per variant and slot that the publisher checks before sending anything. Workers can crash in the middle of a batch, so every publish attempt is written to a history table before and after the call. When the worker restarts, it reads that history and skips anything that already succeeded. This keeps the platform from ever seeing the same post twice.",
};

function setup() {
  const db = openDb(":memory:");
  const post = createPost(db, sample);
  return { db, post };
}

test("one stored post produces different variants that all pass their profile", () => {
  const { db, post } = setup();
  const variants = generateVariants(db, post.id);
  assert.equal(variants.length, 3);
  assert.equal(new Set(variants.map((v) => v.text)).size, 3);
  for (const variant of variants) {
    assert.deepEqual(validateVariant(variant.platform, variant.text), []);
    assert.equal(variant.status, "draft");
  }
});

test("x text over 280 characters is flagged with max_length", () => {
  const violations = validateVariant("x", "a".repeat(281));
  assert.equal(violations.length, 1);
  assert.equal(violations[0].rule, "max_length");
});

test("too many hashtags is flagged with max_hashtags", () => {
  const violations = validateVariant("x", "Short #one #two #three");
  assert.equal(violations.length, 1);
  assert.equal(violations[0].rule, "max_hashtags");
});

test("a rule-breaking manual variant is blocked and the error names the rule", () => {
  const { db, post } = setup();
  assert.throws(
    () => createManualVariant(db, post.id, { platform: "x", text: "a".repeat(300) }),
    (error) => error.status === 422 && error.message.includes("max_length")
  );
});
