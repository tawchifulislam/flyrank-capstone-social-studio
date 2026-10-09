# Social Media Studio

Turns one blog post into a social campaign. The service makes one variant per platform, a person approves each variant, and a scheduler publishes each approved variant at its time, one time only, through a single adapter interface.

## What it does

- Ingests a blog post from a URL or from pasted Markdown and stores it. All generation reads only the stored post.
- Generates one variant per platform (Telegram, X, LinkedIn) from templates. Each platform has a constraint profile (maximum length and hashtag count) that the code enforces.
- Runs a review workflow: draft, then approved or rejected. Only approved variants can be scheduled.
- Publishes through one SocialPublisher interface. There is one real adapter (Telegram) and two mock adapters (X, LinkedIn) that record what they would post in the database.
- Schedules with a durable worker. A retried publish makes one post, and a worker that stops in the middle of a publish continues without duplicates.
- Keeps a publish history of every attempt and its result.

## Architecture

    [blog post: URL or Markdown]
              |
              v
    ingest + store (posts)  --->  variant generator  --->  constraint validation
                                  (templates)              (length, hashtags)
              |
              v
    review workflow: draft -> approved | rejected   (editing sends a variant back to draft)
              |
              v
    schedule: one slot per variant, one idempotency key per variant and slot time
              |
              v
    scheduler worker: polls due slots, recovers stuck claims after a crash
              |
              v
    SocialPublisher interface
        +-- TelegramPublisher (real, Telegram Bot API)
        +-- MockXPublisher, MockLinkedInPublisher (record posts in mock_posts)
              |
              v
    publish history (publish_attempts): success | failed | unknown | duplicate_ignored

Code is layered: routes (HTTP and input checks), services (rules and workflow), repositories (SQL), adapters (platforms). The application depends on the SocialPublisher interface only. The adapter for each platform is chosen by configuration, so swapping an adapter never touches business logic.

## Requirements

- Node.js 22.13 or newer (the built-in node:sqlite module is used).
- A Unix shell such as Git Bash, macOS Terminal or Linux, for the scripts.
- A Telegram bot token and a channel are optional. Without them, every platform can run on mock adapters.

## Run

    cp .env.example .env
    npm install
    npm start

The server listens on port 3000. In a second terminal, seed sample data:

    bash scripts/seed.sh

To run with no Telegram account, publish the Telegram variants through the mock adapter:

    ADAPTER_TELEGRAM=mock_x npm start

To use real Telegram, create a bot with BotFather, create a public channel, add the bot as an administrator with permission to post, and set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID (for example @my_channel) in .env. Check the setup with:

    npm run smoke:telegram

## Configuration

| Variable | Default | Meaning |
| ---------- | --------- | --------- |
| PORT | 3000 | HTTP port |
| DATABASE_PATH | ./data/studio.db | SQLite file |
| ADAPTER_TELEGRAM | telegram | Adapter used for telegram variants (telegram, mock_x, mock_linkedin) |
| ADAPTER_X | mock_x | Adapter used for x variants |
| ADAPTER_LINKEDIN | mock_linkedin | Adapter used for linkedin variants |
| TELEGRAM_BOT_TOKEN | empty | Bot token, never committed |
| TELEGRAM_CHAT_ID | empty | Channel username or chat id |
| SCHEDULER_ENABLED | true | Run the worker inside the server |
| SCHEDULER_INTERVAL_MS | 5000 | How often the worker looks for due slots |
| SCHEDULER_STALE_CLAIM_MS | 60000 | Age after which a claimed slot is treated as stuck |
| MOCK_PUBLISH_DELAY_MS | 0 | Demo hook: delay inside mock adapters |
| MOCK_CRASH_AFTER_POST | false | Demo hook: mock adapters end the process right after recording a post |

## API

| Method and path | Purpose |
| ----------------- | --------- |
| POST /posts | Ingest a post: body {"markdown": "..."} or {"url": "https://..."} |
| GET /posts/:id | Read a stored post |
| POST /posts/:id/variants/generate | Generate variants, optional body {"platforms": ["x"]} |
| GET /posts/:id/variants | List variants |
| POST /posts/:id/variants | Create a variant by hand: {"platform": "x", "text": "..."}, blocked if it breaks a rule |
| GET /variants/:id | Read a variant |
| PATCH /variants/:id | Edit text, the variant returns to draft |
| POST /variants/:id/approve | draft to approved |
| POST /variants/:id/reject | draft to rejected, optional {"reason": "..."} |
| POST /variants/:id/schedule | Schedule an approved variant: {"scheduledAt": "2030-01-01T10:00:00Z"}, other statuses return 409 |
| POST /slots/:id/publish | Publish a slot now, through the same idempotent path the worker uses |
| GET /publish-history | Every publish attempt and its result |
| GET /mock-posts | What the mock adapters would have posted, with previews |
| GET /health | Liveness |

## How the guarantees work

Idempotent publish. Every slot has a unique idempotency key built from the variant id and the slot time. Before sending, the publisher checks the history for a success with that key. If one exists, nothing is sent and the call is recorded as duplicate_ignored. A slot is claimed with one atomic update (pending to claimed), so concurrent calls cannot both publish.

Unknown outcomes. A timeout after the platform accepted a post looks like a failure. Such attempts are recorded as unknown. On the next try the adapter lookup(key) is asked whether the post exists. If it does, the slot is marked published without sending again. If it cannot be verified, the slot is marked failed instead of risking a second post.

Crash recovery. When the worker starts it checks every claimed slot with the same lookup: post found, slot done; provably no post, slot back to pending; cannot verify, slot failed. Slots that fail with a retryable error get a retry_at time using exponential backoff with jitter, and the Retry-After wait is honored when a platform sends one. After three failed attempts a slot is marked failed.

Secrets. Tokens live in .env only. The repository ships .env.example. Errors from the Telegram adapter never contain the token.

## Demo and checks

    npm test
    bash scripts/probes.sh
    bash scripts/demo-schedule.sh 60
    bash scripts/demo-publish.sh

Crash demo with a mock adapter, so the crash point is exact:

    rm -rf data
    ADAPTER_TELEGRAM=mock_x MOCK_CRASH_AFTER_POST=true npm start
    bash scripts/demo-schedule.sh 15
    ADAPTER_TELEGRAM=mock_x npm start
    curl -s localhost:3000/publish-history
    curl -s localhost:3000/mock-posts

History shows one success and mock-posts shows one post.

## Project layout

    src/adapters     SocialPublisher interface, Telegram adapter, mock adapters, registry
    src/routes       HTTP routes
    src/services     ingestion, variants, validation, review, publisher, scheduler
    src/repositories SQL for posts, variants, slots, attempts
    tests            automated tests
    scripts          demo and probe scripts
    docs/DESIGN.md   one page design, with the changes made later

## Known limitations

- Telegram has no idempotency key and no way to look up a sent message. After an unknown outcome or a crash during a Telegram publish, the slot is marked failed and a person must check the channel. This is at most once delivery on Telegram by choice. The mock adapters can verify, so they recover fully.
- One worker process is assumed. Running two workers on the same database is not supported.
- The API has no authentication.
- Variants come from templates. AI generation (Gemini or Ollama) is not implemented. Only length and hashtag count are enforced, tone is guidance for the generator.
- URL ingestion reads text with simple patterns, does not run JavaScript, and blocks private addresses by hostname and IP literal only, not by DNS result.
- Stretch goals are not implemented.
- node:sqlite is still marked experimental by Node.js.
