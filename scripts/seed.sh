BASE="${BASE_URL:-http://localhost:3000}"

json() { curl -s -H "Content-Type: application/json" "$@"; }
id_of() { grep -o '"id":[0-9]*' | head -1 | grep -o '[0-9]*'; }

POST=$(json -X POST "$BASE/posts" -d '{"markdown":"# Seed post\n\nThis sample blog post seeds the demo. Each platform gets its own variant, a person approves it, and the scheduler publishes it once."}')
POST_ID=$(echo "$POST" | id_of)

echo "post $POST_ID stored"
curl -s -X POST "$BASE/posts/$POST_ID/variants/generate"
echo
