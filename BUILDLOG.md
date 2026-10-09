# Build Log

Where AI helped, where it was wrong, and what I changed.

## Where AI helped

- Phase 1: AI drafted the design doc (constraint profiles, data model, the SocialPublisher signature, API surface). I chose Node with Express, SQLite and Telegram as the real target.
- Phases 2 to 5: AI wrote the first version of the ingestion, variant generation, review workflow, adapters, publish service and scheduler, and the tests. I ran every step myself and checked it with curl and npm test before moving on.
- AI wrote the demo and probe scripts, which I used to produce the evidence.

## Where AI was wrong, and what I changed

1. The demo curl commands hard-coded ids such as post 1 and variant 1. My database already had rows, so the real ids were different and the calls returned "variant not found" and "slot not found". I replaced them with scripts that read the ids from the API responses (scripts/demo-publish.sh).
2. A date command that used node -e inside a command substitution printed "stdout is not a tty" in Git Bash on Windows and left the time empty, so scheduling failed with 400. I switched to date -u -d.
3. After a schema change, the old data/studio.db was still on disk. I noticed because the post ids did not start at 1. I stopped the server, deleted the data folder and ran again.
4. The first design recorded only success, failed and duplicate_ignored for an attempt. A timeout after the platform accepted the post cannot be told apart from a plain failure, and retrying it would post twice. I added an unknown result and an adapter lookup(key) to settle it, and I accepted that Telegram cannot be verified, so those slots are marked failed instead of retried.

## What I checked myself

- Idempotency: three publish calls for one slot sent one Telegram message and the history shows one success and two duplicate_ignored.
- Crash recovery: a crash right after the mock post was recorded, then a restart, gave one success and one mock post.
- npm test passes on a clean database because the tests use an in-memory database.
