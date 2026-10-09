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
