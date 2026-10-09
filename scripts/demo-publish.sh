BASE="${BASE_URL:-http://localhost:3000}"

json() { curl -s -H "Content-Type: application/json" "$@"; }
id_of() { grep -o '"id":[0-9]*' | head -1 | grep -o '[0-9]*'; }

POST=$(json -X POST "$BASE/posts" -d '{"markdown":"# Idempotency in practice\n\nA retry must never create a second post. A unique key per variant and slot stops duplicates."}')
POST_ID=$(echo "$POST" | id_of)

GEN=$(curl -s -X POST "$BASE/posts/$POST_ID/variants/generate")
VARIANT_ID=$(echo "$GEN" | grep -o '"id":[0-9]*,"post_id":[0-9]*,"platform":"telegram"' | id_of)

FUTURE=$(date -u -d '+10 minutes' +%Y-%m-%dT%H:%M:%SZ)
curl -s -X POST "$BASE/variants/$VARIANT_ID/approve" > /dev/null
SLOT=$(json -X POST "$BASE/variants/$VARIANT_ID/schedule" -d "{\"scheduledAt\":\"$FUTURE\"}")
SLOT_ID=$(echo "$SLOT" | id_of)

echo "post=$POST_ID variant=$VARIANT_ID slot=$SLOT_ID"
echo "$SLOT"

for i in 1 2 3; do
  echo
  echo "publish call $i"
  curl -s -w "\nHTTP %{http_code}\n" -X POST "$BASE/slots/$SLOT_ID/publish"
done

echo
echo "publish history"
curl -s "$BASE/publish-history"
echo
