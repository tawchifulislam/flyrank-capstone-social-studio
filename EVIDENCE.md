# Evidence

One proof per requirement.

## Constraint profiles enforced by code

A variant that breaks a platform rule is blocked with an error that names the rule.

Command:

    TEXT=$(printf 'a%.0s' $(seq 1 300))
    curl -s -i -X POST localhost:3000/posts/1/variants -H "Content-Type: application/json" -d "{\"platform\":\"x\",\"text\":\"$TEXT\"}"

Output:

    HTTP/1.1 422 Unprocessable Entity
    {"error":"rule max_length broken: text has 300 characters, x allows 280"}

Unknown platform:

    curl -s -X POST localhost:3000/posts/1/variants -H "Content-Type: application/json" -d '{"platform":"facebook","text":"hi"}'
    {"error":"unknown platform \"facebook\""}

Automated test: tests/variants.test.js, "a rule-breaking manual variant is blocked and the error names the rule".

## Review workflow

Only approved variants can be scheduled. Other statuses return 409 with an error message.

Unapproved variant (draft):

    curl -s -i -X POST localhost:3000/variants/2/schedule -H "Content-Type: application/json" -d "{\"scheduledAt\":\"$FUTURE\"}"
    HTTP/1.1 409 Conflict
    {"error":"only approved variants can be scheduled, this one is draft"}

Approved variant:

    curl -s -X POST localhost:3000/variants/2/approve
    {"id":2,"platform":"x","status":"approved", ...}
    curl -s -i -X POST localhost:3000/variants/2/schedule ...
    HTTP/1.1 201 Created
    {"id":1,"variant_id":2,"scheduled_at":"2026-10-09T09:38:47.000Z","status":"pending","idempotency_key":"variant:2:2026-10-09T09:38:47.000Z"}

Same variant and time again returns the same slot (HTTP 200, slot id 1). A different time returns:

    HTTP/1.1 409 Conflict
    {"error":"variant is already scheduled for 2026-10-09T09:38:47.000Z"}

Editing an approved variant returns it to draft and removes the pending slot, so scheduling it again returns 409.

Automated tests: tests/review.test.js, 9 tests. npm test: 13 pass, 0 fail.

## Adapter layer

One SocialPublisher interface. Real adapter: TelegramPublisher. Mock adapters: MockXPublisher and MockLinkedInPublisher, which record what they would post in the mock_posts table. The application picks an adapter from configuration (ADAPTER_TELEGRAM, ADAPTER_X, ADAPTER_LINKEDIN).

Real message in my own Telegram channel:

    npm run smoke:telegram

Screenshot: docs/evidence/telegram-post.png

Swapping the adapter in configuration, with no code change outside src/adapters, is covered by tests/adapters.test.js, "swapping the adapter in configuration changes the publisher with no code change".

## Idempotent publish

The same variant and slot never posts twice. Each slot has an idempotency key. A second publish call for a slot that already succeeded sends nothing and is recorded as duplicate_ignored.

Command: bash scripts/demo-publish.sh (real Telegram adapter)

Output:

    post=3 variant=7 slot=2
    publish call 1
    {"slotId":2,"variantId":7,"outcome":"published","externalId":"@socialstudio339:4", ...}
    HTTP 201
    publish call 2
    {"slotId":2,"variantId":7,"outcome":"already_published","externalId":"@socialstudio339:4"}
    HTTP 200
    publish call 3
    {"slotId":2,"variantId":7,"outcome":"already_published","externalId":"@socialstudio339:4"}
    HTTP 200

Screenshot of the channel after the three calls, one message only: docs/evidence/telegram-idempotent-publish.png

Automated tests: tests/publish.test.js, 8 tests. They cover a single post, duplicate_ignored, 5 concurrent calls producing one post, a timeout after the platform accepted the post (resolved by lookup, no second post), an unverifiable adapter that is not retried, rate limit retry, the attempt limit, and an unapproved variant. npm test: 31 pass, 0 fail.

## Publish history

Each attempt is recorded with its result.

Command: curl -s localhost:3000/publish-history

Output (newest first):

    {"attempts":[{"id":3,"slot_id":2,"variant_id":7,"platform":"telegram","idempotency_key":"variant:7:2026-10-09T10:00:38.000Z","result":"duplicate_ignored","external_id":"@socialstudio339:4","error":null,"attempted_at":"2026-10-09T09:50:39.566Z"},{"id":2,"slot_id":2,"variant_id":7,"platform":"telegram","idempotency_key":"variant:7:2026-10-09T10:00:38.000Z","result":"duplicate_ignored","external_id":"@socialstudio339:4","error":null,"attempted_at":"2026-10-09T09:50:39.526Z"},{"id":1,"slot_id":2,"variant_id":7,"platform":"telegram","idempotency_key":"variant:7:2026-10-09T10:00:38.000Z","result":"success","external_id":"@socialstudio339:4","error":null,"attempted_at":"2026-10-09T09:50:39.484Z"}]}

## Durable scheduling

A worker polls for due slots and publishes them through the adapter. A worker that stops in the middle of a publish resumes without double posting: on startup every claimed slot is checked with the adapter lookup. If the post exists the slot is marked done, if it provably does not exist the slot goes back to pending, and if the adapter cannot verify (Telegram) the slot is marked failed so no duplicate is risked.

Scheduled publish with no manual publish call (real Telegram adapter):

    npm start
    bash scripts/demo-schedule.sh 60

The post "Scheduled by the worker" appeared in my channel at 3:56 PM, about a minute later, published by the worker. Screenshot: docs/evidence/telegram-scheduled-publish.png

Crash after the platform accepted the post, then restart (mock adapter so the crash point is exact):

    rm -rf data
    ADAPTER_TELEGRAM=mock_x MOCK_CRASH_AFTER_POST=true npm start
    bash scripts/demo-schedule.sh 15
    ADAPTER_TELEGRAM=mock_x npm start
    curl -s localhost:3000/publish-history
    curl -s localhost:3000/mock-posts

The first server process exited right after recording the mock post (mock post created_at 09:58:55). After the restart:

    {"attempts":[{"id":1,"slot_id":1,"variant_id":1,"platform":"telegram","idempotency_key":"variant:1:2026-10-09T09:58:55.000Z","result":"success","external_id":"mock_x:1","error":null,"attempted_at":"2026-10-09T09:59:18.648Z"}]}
    {"posts":[{"id":1,"adapter":"mock_x","variant_id":1,"idempotency_key":"variant:1:2026-10-09T09:58:55.000Z","text":"...","preview":"...","created_at":"2026-10-09T09:58:55.769Z"}]}

One success in the history, one post in mock_posts. The success was recorded at 09:59:18, after the restart, and the post was not sent a second time.

Automated tests: tests/scheduler.test.js, 7 tests. They cover not-yet-due slots, a due slot published once, recovery after a crash after the post, recovery after a crash before the post, an adapter that cannot verify, retry-after backoff, and fresh claims left alone.
