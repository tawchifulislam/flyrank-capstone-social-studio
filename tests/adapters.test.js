import test from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../src/db.js";
import { TelegramPublisher } from "../src/adapters/TelegramPublisher.js";
import { PublishError } from "../src/adapters/PublishError.js";
import { MockXPublisher, MockLinkedInPublisher } from "../src/adapters/mock.js";
import { listMockPosts } from "../src/adapters/mockStore.js";
import { createPublisherRegistry } from "../src/adapters/registry.js";

const TOKEN = "123:ABC";

function fakeFetch(status, body, headers = {}) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json", ...headers },
    });
  };
  fn.calls = calls;
  return fn;
}

function telegram(fetchImpl) {
  return new TelegramPublisher({ token: TOKEN, chatId: "@chan", fetchImpl });
}

const request = { variantId: 1, text: "hello", idempotencyKey: "variant:1:t" };

test("telegram sends the text to sendMessage and returns an external id", async () => {
  const fetchImpl = fakeFetch(200, { ok: true, result: { message_id: 42 } });
  const result = await telegram(fetchImpl).publish(request);
  assert.equal(result.externalId, "@chan:42");
  assert.ok(fetchImpl.calls[0].url.includes(`/bot${TOKEN}/sendMessage`));
  const sent = JSON.parse(fetchImpl.calls[0].init.body);
  assert.equal(sent.chat_id, "@chan");
  assert.equal(sent.text, "hello");
});

test("telegram 429 becomes a retryable error with the retry-after wait", async () => {
  const fetchImpl = fakeFetch(429, {
    ok: false,
    error_code: 429,
    description: "Too Many Requests: retry after 30",
    parameters: { retry_after: 30 },
  });
  await assert.rejects(telegram(fetchImpl).publish(request), (error) => {
    return (
      error instanceof PublishError &&
      error.retryable === true &&
      error.retryAfterMs === 30000
    );
  });
});

test("telegram 500 is retryable", async () => {
  const fetchImpl = fakeFetch(500, { ok: false, error_code: 500, description: "boom" });
  await assert.rejects(
    telegram(fetchImpl).publish(request),
    (error) => error.retryable === true
  );
});

test("telegram 400 is not retryable", async () => {
  const fetchImpl = fakeFetch(400, {
    ok: false,
    error_code: 400,
    description: "Bad Request: chat not found",
  });
  await assert.rejects(
    telegram(fetchImpl).publish(request),
    (error) => error.retryable === false
  );
});

test("a network failure is retryable and never leaks the token", async () => {
  const fetchImpl = async () => {
    throw new Error(`connect ECONNRESET ${TOKEN}`);
  };
  await assert.rejects(telegram(fetchImpl).publish(request), (error) => {
    return error.retryable === true && !error.message.includes(TOKEN);
  });
});

test("telegram without a token is a clear configuration error", () => {
  assert.throws(
    () => new TelegramPublisher({ token: "", chatId: "@chan" }),
    /TELEGRAM_BOT_TOKEN/
  );
});

test("mock adapters record the post in the database and return a preview", async () => {
  const db = openDb(":memory:");
  const result = await new MockXPublisher(db).publish(request);
  assert.ok(result.preview.includes("hello"));
  const rows = listMockPosts(db);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].adapter, "mock_x");
  assert.equal(rows[0].text, "hello");
});

test("mock adapters do not hide duplicates, so the app must guard against them", async () => {
  const db = openDb(":memory:");
  const publisher = new MockLinkedInPublisher(db);
  await publisher.publish(request);
  await publisher.publish(request);
  assert.equal(listMockPosts(db).length, 2);
});

test("swapping the adapter in configuration changes the publisher with no code change", () => {
  const db = openDb(":memory:");
  const config = {
    adapterByPlatform: { telegram: "mock_x", x: "mock_x", linkedin: "mock_linkedin" },
  };
  const registry = createPublisherRegistry({ db, config });
  assert.ok(registry.forPlatform("telegram") instanceof MockXPublisher);
  assert.equal(registry.forPlatform("telegram"), registry.forPlatform("x"));
});

test("the registry reports a missing telegram token and unknown adapters clearly", () => {
  const db = openDb(":memory:");
  const withTelegram = createPublisherRegistry({
    db,
    config: {
      adapterByPlatform: { telegram: "telegram" },
      telegramBotToken: "",
      telegramChatId: "",
    },
  });
  assert.throws(() => withTelegram.forPlatform("telegram"), /TELEGRAM_BOT_TOKEN/);

  const unknown = createPublisherRegistry({
    db,
    config: { adapterByPlatform: { x: "nope" } },
  });
  assert.throws(() => unknown.forPlatform("x"), /unknown adapter/);
});
