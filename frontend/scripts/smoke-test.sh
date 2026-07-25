#!/usr/bin/env bash
# Post-deploy smoke test for Frostbite mainnet.
# Curls key routes and asserts expected HTTP status. Exits non-zero on any failure.
#
# Usage:
#   ./smoke-test.sh                       # tests https://frostbite.pro
#   ./smoke-test.sh http://127.0.0.1:3000 # tests a local/candidate port (blue-green cutover gate)
#
# NOTE: basePath is /avalanche, so all app routes live under /avalanche/...
set -uo pipefail

BASE="${1:-https://frostbite.pro}"
CURL_TIMEOUT=15
RETRIES=5          # boot can take ~1 min; retry before declaring failure
RETRY_SLEEP=8

# route|expected_status  (add more as needed)
CHECKS=(
  "/avalanche|200"                       # landing (arcade)
  "/avalanche/world|200"                 # TD world
  "/avalanche/cardgame|200"              # car(d) game
  "/avalanche/cardgame?embed=1|200"      # hub-embed variant (chrome hidden)
  "/avalanche/battle?embed=1|200"        # hub iframe route
  "/avalanche/api/health|200"            # lightweight DB readiness probe
  "/avalanche/marketplace|200"
  "/avalanche/nft-score|200"
)

pass=0; fail=0
echo "== Frostbite smoke test against ${BASE} =="

check_one() {
  local path="$1" want="$2" url="${BASE}${1}" code
  for attempt in $(seq 1 "$RETRIES"); do
    code=$(curl -s -o /dev/null -w '%{http_code}' \
                --max-time "$CURL_TIMEOUT" \
                -H 'User-Agent: frostbite-smoke/1.0' \
                "$url" 2>/dev/null || echo "000")
    if [[ "$code" == "$want" ]]; then
      printf '  OK   %-40s %s\n' "$path" "$code"
      return 0
    fi
    # 502/503/000 during boot -> retry; anything else fail fast after 2 tries
    if [[ "$code" =~ ^(502|503|504|000)$ ]] && (( attempt < RETRIES )); then
      sleep "$RETRY_SLEEP"; continue
    fi
    if (( attempt < 2 )); then sleep "$RETRY_SLEEP"; continue; fi
    printf '  FAIL %-40s got %s want %s\n' "$path" "$code" "$want"
    return 1
  done
  printf '  FAIL %-40s still %s after %s retries\n' "$path" "$code" "$RETRIES"
  return 1
}

for entry in "${CHECKS[@]}"; do
  path="${entry%%|*}"; want="${entry##*|}"
  if check_one "$path" "$want"; then ((pass++)); else ((fail++)); fi
done

echo "== ${pass} passed, ${fail} failed =="
exit $(( fail > 0 ? 1 : 0 ))
