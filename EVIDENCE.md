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

## Acceptance probes

Run against a live server with `bash scripts/probes.sh 20`. First with the real Telegram adapter, then again with `ADAPTER_TELEGRAM=mock_x`. Screenshot of the channel after the first run: docs/evidence/telegram-probes.png

PROBE 1, ingest a sample post, every variant passes its profile:

    {"variants":[{"id":1,"post_id":1,"platform":"telegram","text":"New post: Probe post\n\nOne sentence of source text for the probes. A second sentence adds more detail for the longer platforms.\n\n#Probe #Post","status":"draft", ...},{"id":2,"post_id":1,"platform":"x","text":"One sentence of source text for the probes.\n#Probe #Post","status":"draft", ...},{"id":3,"post_id":1,"platform":"linkedin","text":"Probe post\n\nOne sentence of source text for the probes. A second sentence adds more detail for the longer platforms.\n\n#Probe #Post","status":"draft", ...}]}

PROBE 2, a rule-breaking variant is blocked before review and the error names the rule:

    {"error":"rule max_length broken: text has 300 characters, x allows 280"}
    HTTP 422

PROBE 3, scheduling an unapproved variant is refused:

    {"error":"only approved variants can be scheduled, this one is draft"}
    HTTP 409

PROBE 4, an approved variant is scheduled 20 seconds out and the scheduler publishes it to the real target. The publish record links to the live message (external_id is the channel and the message id):

    {"id":1,"variant_id":1,"scheduled_at":"2026-10-09T10:03:51.000Z","status":"pending","idempotency_key":"variant:1:2026-10-09T10:03:51.000Z","claimed_at":null,"retry_at":null,"created_at":"2026-10-09T10:03:31.411Z"}
    {"id":1,"slot_id":1,"variant_id":1,"platform":"telegram","idempotency_key":"variant:1:2026-10-09T10:03:51.000Z","result":"success","external_id":"@socialstudio339:6","error":null,"attempted_at":"2026-10-09T10:03:54.592Z"}

PROBE 5, force a publish retry by stopping the worker mid-publish and restarting: see the section Durable scheduling above. One success in the history and one post in mock_posts.

PROBE 6, swap the adapter in configuration. The same script run with `ADAPTER_TELEGRAM=mock_x npm start` publishes the same kind of campaign through the mock, with no code change:

    {"id":1,"slot_id":1,"variant_id":1,"platform":"telegram","idempotency_key":"variant:1:2026-10-09T10:04:47.000Z","result":"success","external_id":"mock_x:1","error":null,"attempted_at":"2026-10-09T10:04:50.590Z"}
    {"posts":[{"id":1,"adapter":"mock_x","variant_id":1,"idempotency_key":"variant:1:2026-10-09T10:04:47.000Z","text":"New post: Probe post ...","preview":"[mock X post]\nNew post: Probe post ...","created_at":"2026-10-09T10:04:50.587Z"}]}

## Ingestion

A post enters as pasted Markdown or as a URL and is stored. Variants are generated from the stored post only. A private address is refused.

Command:

    curl -s -w \nHTTP %{http_code} -X POST http://localhost:3000/posts -H Content-Type: application/json -d {"markdown":"# Stored post\n\nThis text is stored once. Every variant is built from the stored copy."}

Output:

    {"id":2,"source_type":"markdown","source_url":null,"title":"Stored post","body":"# Stored post\n\nThis text is stored once. Every variant is built from the stored copy.","created_at":"2026-10-09T10:11:27.628Z"}
    HTTP 201

Command:

    curl -s http://localhost:3000/posts/2

Output:

    {"id":2,"source_type":"markdown","source_url":null,"title":"Stored post","body":"# Stored post\n\nThis text is stored once. Every variant is built from the stored copy.","created_at":"2026-10-09T10:11:27.628Z"}

Command:

    curl -s -w \nHTTP %{http_code} -X POST http://localhost:3000/posts -H Content-Type: application/json -d {"url":"https://example.com"}

Output:

    {"id":3,"source_type":"url","source_url":"https://example.com","title":"Example Domain","body":"Example Domain This domain is for use in documentation examples without needing permission. This is not a service; avoid relying on it for testing and monitoring purposes.","created_at":"2026-10-09T10:11:28.022Z"}
    HTTP 201

Command:

    curl -s -w \nHTTP %{http_code} -X POST http://localhost:3000/posts -H Content-Type: application/json -d {"url":"http://localhost:3000/health"}

Output:

    {"error":"url points to a private address"}
    HTTP 400

Command:

    curl -s -w \nHTTP %{http_code} -X POST http://localhost:3000/posts -H Content-Type: application/json -d {}

Output:

    {"error":"provide either markdown or url"}
    HTTP 400

Command:

    curl -s -X POST http://localhost:3000/posts/2/variants/generate

Output:

    {"variants":[{"id":4,"post_id":2,"platform":"telegram","text":"New post: Stored post\n\nThis text is stored once. Every variant is built from the stored copy.\n\n#Stored #Post","status":"draft","rejection_reason":null,"created_at":"2026-10-09T10:11:28.303Z","updated_at":"2026-10-09T10:11:28.303Z"},{"id":5,"post_id":2,"platform":"x","text":"This text is stored once.\n#Stored #Post","status":"draft","rejection_reason":null,"created_at":"2026-10-09T10:11:28.303Z","updated_at":"2026-10-09T10:11:28.303Z"},{"id":6,"post_id":2,"platform":"linkedin","text":"Stored post\n\nThis text is stored once. Every variant is built from the stored copy.\n\n#Stored #Post","status":"draft","rejection_reason":null,"created_at":"2026-10-09T10:11:28.303Z","updated_at":"2026-10-09T10:11:28.303Z"}]}

Generation reads the post through getPost and uses only its stored title, body and source URL:

Command:

    grep -n getPost\|post\.body\|post\.title\|post\.source_url src/services/variants.js src/services/generators/templates.js

Output:

    src/services/variants.js:3:import { getPost } from "../repositories/posts.js";
    src/services/variants.js:13:  const post = getPost(db, postId);
    src/services/generators/templates.js:87:    const summary = sentences.slice(0, 2).join(" ") || post.title;
    src/services/generators/templates.js:89:      [`New post: ${post.title}`, s, link, tags.join(" ")]
    src/services/generators/templates.js:98:      [post.title, s, link ? `Read the full post: ${link}` : "", tags.join(" ")]
    src/services/generators/templates.js:105:  telegram: (post, sentences) => sentences.slice(0, 2).join(" ") || post.title,
    src/services/generators/templates.js:106:  x: (post, sentences) => sentences[0] || post.title,
    src/services/generators/templates.js:107:  linkedin: (post, sentences) => sentences.slice(0, 4).join(" ") || post.title,
    src/services/generators/templates.js:112:  const sentences = splitSentences(toPlain(post.body));
    src/services/generators/templates.js:113:  const tags = hashtagsFor(post.title, profile.maxHashtags);
    src/services/generators/templates.js:114:  const link = post.source_url ?? "";

## Secrets clean

Tokens live in .env only. .env is ignored by git and the repository ships .env.example.

Command:

    git ls-files .env .env.example

Output:

    .env.example

Command:

    git check-ignore -v .env

Output:

    .gitignore:2:.env .env

Number of commits in the whole history that contain the bot token:

    0

Command:

    grep -rn TELEGRAM_BOT_TOKEN src

Output:

    src/adapters/TelegramPublisher.js:14:      throw new Error("TELEGRAM_BOT_TOKEN is not set");
    src/config.js:11:  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || "",

The Telegram adapter test checks that an error never contains the token (tests/adapters.test.js, a network failure is retryable and never leaks the token).

## README and a stranger run

The README has what the system does, an architecture sketch, exact run and seed steps and a limitations section. A fresh clone of the public repository installs, passes its tests and answers on its own port:

Command:

    bash -c cd '/tmp/tmp.fsaluGixIy/repo' && npm install --silent 2>&1 | tail -n 3; npm test 2>&1 | tail -n 9

Output:

    ✔ a rule-breaking manual variant is blocked and the error names the rule (1.0006ms)
    ℹ tests 38
    ℹ suites 0
    ℹ pass 38
    ℹ fail 0
    ℹ cancelled 0
    ℹ skipped 0
    ℹ todo 0
    ℹ duration_ms 221.5277

Command:

    curl -s http://localhost:3100/health

Output:

    {"status":"ok"}

Command:

    env BASE_URL=http://localhost:3100 bash /tmp/tmp.fsaluGixIy/repo/scripts/seed.sh

Output:

    post 1 stored
    {"variants":[{"id":1,"post_id":1,"platform":"telegram","text":"New post: Seed post\n\nThis sample blog post seeds the demo. Each platform gets its own variant, a person approves it, and the scheduler publishes it once.\n\n#Seed #Post","status":"draft","rejection_reason":null,"created_at":"2026-10-09T10:11:43.959Z","updated_at":"2026-10-09T10:11:43.959Z"},{"id":2,"post_id":1,"platform":"x","text":"This sample blog post seeds the demo.\n#Seed #Post","status":"draft","rejection_reason":null,"created_at":"2026-10-09T10:11:43.959Z","updated_at":"2026-10-09T10:11:43.959Z"},{"id":3,"post_id":1,"platform":"linkedin","text":"Seed post\n\nThis sample blog post seeds the demo. Each platform gets its own variant, a person approves it, and the scheduler publishes it once.\n\n#Seed #Post","status":"draft","rejection_reason":null,"created_at":"2026-10-09T10:11:43.959Z","updated_at":"2026-10-09T10:11:43.959Z"}]}

Files required at submission:

Command:

    ls -1 README.md capstone.yaml EVIDENCE.md BUILDLOG.md .env.example

Output:

    .env.example
    BUILDLOG.md
    capstone.yaml
    EVIDENCE.md
    README.md
