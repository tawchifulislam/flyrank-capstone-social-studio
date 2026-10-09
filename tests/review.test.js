import test from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../src/db.js";
import { createPost } from "../src/repositories/posts.js";
import { getSlotByVariant } from "../src/repositories/slots.js";
import { generateVariants } from "../src/services/variants.js";
import {
  approveVariant,
  editVariant,
  rejectVariant,
  scheduleVariant,
} from "../src/services/review.js";

const sample = {
  sourceType: "markdown",
  sourceUrl: null,
  title: "Idempotency in practice",
  body: "# Idempotency in practice\n\nA retry must never create a second post. A unique key per variant and slot stops duplicates.",
};

function setup() {
  const db = openDb(":memory:");
  const post = createPost(db, sample);
  const variants = generateVariants(db, post.id);
  const x = variants.find((variant) => variant.platform === "x");
  return { db, x, variants };
}

const inTwoMinutes = () => new Date(Date.now() + 120000).toISOString();
const inThreeMinutes = () => new Date(Date.now() + 180000).toISOString();

function statusIs(code) {
  return (error) => error.status === code;
}

test("an unapproved variant cannot be scheduled", () => {
  const { db, x } = setup();
  assert.throws(() => scheduleVariant(db, x.id, inTwoMinutes()), statusIs(409));
});

test("an approved variant can be scheduled", () => {
  const { db, x } = setup();
  approveVariant(db, x.id);
  const { slot, created } = scheduleVariant(db, x.id, inTwoMinutes());
  assert.equal(created, true);
  assert.equal(slot.status, "pending");
});

test("scheduling the same variant and time twice returns the same slot", () => {
  const { db, x } = setup();
  approveVariant(db, x.id);
  const when = inTwoMinutes();
  const first = scheduleVariant(db, x.id, when);
  const second = scheduleVariant(db, x.id, when);
  assert.equal(second.created, false);
  assert.equal(second.slot.id, first.slot.id);
});

test("scheduling an already scheduled variant for another time is refused", () => {
  const { db, x } = setup();
  approveVariant(db, x.id);
  scheduleVariant(db, x.id, inTwoMinutes());
  assert.throws(() => scheduleVariant(db, x.id, inThreeMinutes()), statusIs(409));
});

test("a time in the past is refused", () => {
  const { db, x } = setup();
  approveVariant(db, x.id);
  const past = new Date(Date.now() - 60000).toISOString();
  assert.throws(() => scheduleVariant(db, x.id, past), statusIs(422));
});

test("a time without a timezone is refused", () => {
  const { db, x } = setup();
  approveVariant(db, x.id);
  assert.throws(() => scheduleVariant(db, x.id, "2030-01-01T10:00:00"), statusIs(400));
});

test("a rejected variant cannot be approved", () => {
  const { db, x } = setup();
  rejectVariant(db, x.id, "off brand");
  assert.throws(() => approveVariant(db, x.id), statusIs(409));
});

test("editing an approved variant returns it to draft and removes its pending slot", () => {
  const { db, x } = setup();
  approveVariant(db, x.id);
  scheduleVariant(db, x.id, inTwoMinutes());
  const edited = editVariant(db, x.id, "A shorter take on retries.");
  assert.equal(edited.status, "draft");
  assert.equal(getSlotByVariant(db, x.id), null);
});

test("an edit that breaks a rule is blocked with the rule name", () => {
  const { db, x } = setup();
  assert.throws(
    () => editVariant(db, x.id, "a".repeat(400)),
    (error) => error.status === 422 && error.message.includes("max_length")
  );
});
