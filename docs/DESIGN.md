# Design

## Problem

A team has one blog post and needs a post for each social platform. Each platform has its own length, tone and hashtag rules. A person must approve every variant. A scheduler must publish each approved variant at its time, exactly once, even after retries or a worker crash.

## Stack

Node.js, Express, SQLite (node:sqlite), a polling worker with a durable job table. Real target: Telegram Bot API. Mock targets: X and LinkedIn.

## Constraint profiles

| Platform | Max length | Max hashtags | Tone |
|----------|-----------|--------------|------|
| telegram | 1000 | 3 | friendly, conversational |
| x | 280 | 2 | short, punchy |
| linkedin | 3000 | 5 | professional, insight-led |

Validation runs when a variant is created, edited, approved and scheduled. A variant that breaks a rule is rejected with an error message that names the broken rule.

## Review workflow

draft -> approved | rejected
approved -> published
Editing an approved variant sends it back to draft.
Only an approved variant can be scheduled. Any other status returns 409 with an error message.

## Data model

posts: id, source_type (url | markdown), source_url, title, body, created_at
variants: id, post_id, platform, text, status, rejection_reason, created_at, updated_at
slots: id, variant_id, scheduled_at, status (pending | claimed | done | failed), idempotency_key (unique), claimed_at, created_at
publish_attempts: id, slot_id, variant_id, platform, idempotency_key, result (success | failed | duplicate_ignored), external_id, error, attempted_at

The idempotency key is built from variant id and slot time. A unique index on slots.idempotency_key and a successful attempt check stop a second post for the same variant and slot.

## SocialPublisher interface

publish({ variantId, text, idempotencyKey }) returns Promise<{ externalId, preview }>
Property: platform (string)

Implementations: TelegramPublisher (real), MockXPublisher, MockLinkedInPublisher. The adapter is chosen from configuration. Business logic never imports a concrete adapter.

## Scheduler

A worker polls the slots table for due pending slots. It claims a slot with a single atomic update (pending -> claimed), calls the publisher, writes a publish attempt, then marks the slot done or failed. On restart, claimed slots older than a timeout are returned to pending. The idempotency check makes a repeated publish a no-op.

## API surface

POST /posts
GET /posts/:id
POST /posts/:id/variants/generate
GET /posts/:id/variants
PATCH /variants/:id
POST /variants/:id/approve
POST /variants/:id/reject
POST /variants/:id/schedule
GET /publish-history
GET /health

## Non-goal

No image generation, analytics, engagement tracking, or publishing to real Instagram, X or LinkedIn accounts.
