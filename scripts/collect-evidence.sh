BASE="${BASE_URL:-http://localhost:3000}"
OUT="${1:-EVIDENCE.md}"

id_of() { grep -o '"id":[0-9]*' | head -1 | grep -o '[0-9]*'; }

show() {
  LAST=$("$@" 2>&1)
  {
    echo
    echo "Command:"
    echo
    printf '    %s\n' "$*"
    echo
    echo "Output:"
    echo
    echo "$LAST" | sed 's/^/    /'
  } >> "$OUT"
}

note() {
  { echo; echo "$1"; } >> "$OUT"
}

note "## Ingestion"
note "A post enters as pasted Markdown or as a URL and is stored. Variants are generated from the stored post only. A private address is refused."

show curl -s -w "\nHTTP %{http_code}" -X POST "$BASE/posts" -H "Content-Type: application/json" -d '{"markdown":"# Stored post\n\nThis text is stored once. Every variant is built from the stored copy."}'
MD_ID=$(echo "$LAST" | id_of)
show curl -s "$BASE/posts/$MD_ID"
show curl -s -w "\nHTTP %{http_code}" -X POST "$BASE/posts" -H "Content-Type: application/json" -d '{"url":"https://example.com"}'
show curl -s -w "\nHTTP %{http_code}" -X POST "$BASE/posts" -H "Content-Type: application/json" -d '{"url":"http://localhost:3000/health"}'
show curl -s -w "\nHTTP %{http_code}" -X POST "$BASE/posts" -H "Content-Type: application/json" -d '{}'
show curl -s -X POST "$BASE/posts/$MD_ID/variants/generate"
note "Generation reads the post through getPost and uses only its stored title, body and source URL:"
show grep -n "getPost\|post\.body\|post\.title\|post\.source_url" src/services/variants.js src/services/generators/templates.js

note "## Secrets clean"
note "Tokens live in .env only. .env is ignored by git and the repository ships .env.example."
show git ls-files .env .env.example
show git check-ignore -v .env
TOKEN=$(grep '^TELEGRAM_BOT_TOKEN=' .env 2>/dev/null | cut -d= -f2- | tr -d '\r')
if [ -n "$TOKEN" ]; then
  COUNT=$(git log --all --oneline -S"$TOKEN" | wc -l | tr -d ' ')
else
  COUNT="no token is set in .env"
fi
{
  echo
  echo "Number of commits in the whole history that contain the bot token:"
  echo
  echo "    $COUNT"
} >> "$OUT"
show grep -rn "TELEGRAM_BOT_TOKEN" src
note "The Telegram adapter test checks that an error never contains the token (tests/adapters.test.js, a network failure is retryable and never leaks the token)."

note "## README and a stranger run"
note "The README has what the system does, an architecture sketch, exact run and seed steps and a limitations section. A fresh clone of the public repository installs, passes its tests and answers on its own port:"
CLONE=$(mktemp -d)
git clone --quiet "$(git remote get-url origin)" "$CLONE/repo"
show bash -c "cd '$CLONE/repo' && npm install --silent 2>&1 | tail -n 3; npm test 2>&1 | tail -n 9"
(cd "$CLONE/repo" && PORT=3100 timeout 20 node src/server.js > /dev/null 2>&1 &)
sleep 4
show curl -s "http://localhost:3100/health"
show env BASE_URL=http://localhost:3100 bash "$CLONE/repo/scripts/seed.sh"
note "Files required at submission:"
show ls -1 README.md capstone.yaml EVIDENCE.md BUILDLOG.md .env.example
