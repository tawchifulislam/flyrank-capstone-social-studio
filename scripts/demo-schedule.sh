BASE="${BASE_URL:-http://localhost:3000}"
AHEAD="${1:-90}"

json() { curl -s -H "Content-Type: application/json" "$@"; }
id_of() { grep -o '"id":[0-9]*' | head -1 | grep -o '[0-9]*'; }

POST=$(json -X POST "$BASE/posts" -d '{"markdown":"# Scheduled by the worker\n\nThis post is published by the scheduler at its time, exactly once, even if the worker restarts."}')
POST_ID=$(echo "$POST" | id_of)

GEN=$(curl -s -X POST "$BASE/posts/$POST_ID/variants/generate")
VARIANT_ID=$(echo "$GEN" | grep -o '"id":[0-9]*,"post_id":[0-9]*,"platform":"telegram"' | id_of)

FUTURE=$(date -u -d "+$AHEAD seconds" +%Y-%m-%dT%H:%M:%SZ)
curl -s -X POST "$BASE/variants/$VARIANT_ID/approve" > /dev/null
SLOT=$(json -X POST "$BASE/variants/$VARIANT_ID/schedule" -d "{\"scheduledAt\":\"$FUTURE\"}")
SLOT_ID=$(echo "$SLOT" | id_of)

echo "post=$POST_ID variant=$VARIANT_ID slot=$SLOT_ID scheduled for $FUTURE"
echo "$SLOT"
