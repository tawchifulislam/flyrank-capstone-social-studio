BASE="${BASE_URL:-http://localhost:3000}"
AHEAD="${1:-20}"

json() { curl -s -H "Content-Type: application/json" "$@"; }
id_of() { grep -o '"id":[0-9]*' | head -1 | grep -o '[0-9]*'; }

echo "PROBE 1: ingest a sample post, every platform variant passes its constraint profile"
POST=$(json -X POST "$BASE/posts" -d '{"markdown":"# Probe post\n\nOne sentence of source text for the probes. A second sentence adds more detail for the longer platforms."}')
POST_ID=$(echo "$POST" | id_of)
GEN=$(curl -s -X POST "$BASE/posts/$POST_ID/variants/generate")
echo "$GEN"
X_ID=$(echo "$GEN" | grep -o '"id":[0-9]*,"post_id":[0-9]*,"platform":"x"' | id_of)
TG_ID=$(echo "$GEN" | grep -o '"id":[0-9]*,"post_id":[0-9]*,"platform":"telegram"' | id_of)

echo
echo "PROBE 2: a variant that breaks a platform rule is blocked and the error names the rule"
TEXT=$(printf 'a%.0s' $(seq 1 300))
json -w "\nHTTP %{http_code}\n" -X POST "$BASE/posts/$POST_ID/variants" -d "{\"platform\":\"x\",\"text\":\"$TEXT\"}"

echo
echo "PROBE 3: scheduling an unapproved variant is refused"
FUTURE=$(date -u -d "+$AHEAD seconds" +%Y-%m-%dT%H:%M:%SZ)
json -w "\nHTTP %{http_code}\n" -X POST "$BASE/variants/$X_ID/schedule" -d "{\"scheduledAt\":\"$FUTURE\"}"

echo
echo "PROBE 4: an approved variant is published by the scheduler at its time"
curl -s -X POST "$BASE/variants/$TG_ID/approve" > /dev/null
FUTURE=$(date -u -d "+$AHEAD seconds" +%Y-%m-%dT%H:%M:%SZ)
SLOT=$(json -X POST "$BASE/variants/$TG_ID/schedule" -d "{\"scheduledAt\":\"$FUTURE\"}")
SLOT_ID=$(echo "$SLOT" | id_of)
echo "$SLOT"
echo "waiting for the scheduler"
PUBLISHED=""
for i in $(seq 1 40); do
  sleep 2
  HIST=$(curl -s "$BASE/publish-history")
  PUBLISHED=$(echo "$HIST" | grep -o "{[^{}]*\"slot_id\":$SLOT_ID,[^{}]*\"result\":\"success\"[^{}]*}")
  if [ -n "$PUBLISHED" ]; then break; fi
done
if [ -n "$PUBLISHED" ]; then echo "$PUBLISHED"; else echo "not published within the wait time"; fi

echo
echo "MOCK POSTS"
curl -s "$BASE/mock-posts"
echo
