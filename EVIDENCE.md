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
