#!/usr/bin/env bash
# Blue-green, release-based, ZERO-downtime, ZERO-data-risk deploy for
# frostbite-mainnet (Avalanche prod).
#
# Model (since 2026-07-25):
#   shared/{data,.env*}           live SQLite DB + uploads + secrets (single copy)
#   frontend/node_modules         node_modules "home"; releases symlink to it
#   releases/<stamp>/frontend     immutable per-deploy build
#   current -> releases/<stamp>    atomic symlink; PM2 cwd points through it
#   frostbite-mainnet        :3000 canonical (blue), serving at steady state
#   frostbite-mainnet-green  :3010 ephemeral, spun up only during a deploy
#   nginx mainnet_upstream -> the color currently taking traffic
#
# Flow: build local -> ship fresh release -> symlink shared -> flip current ->
# start green(:3010, new code) -> health+smoke -> nginx->green (graceful, 0 drop)
# -> restart blue(:3000, new code) -> smoke -> nginx->blue -> stop green -> prune.
# The live DB/uploads live in shared/ and are never in the rsync tree, so
# `--delete` cannot touch them. Rollback (green unhealthy, before any nginx swap):
# flip `current` back to the previous release and kill green — traffic never moved.
#
# Usage:  ./scripts/deploy-mainnet.sh
# NOTE:   if package-lock changed, run `npm ci` in the node_modules home first.
set -euo pipefail

KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519}"
HOST="${DEPLOY_HOST:-root@5.189.173.167}"
LOCAL="$(cd "$(dirname "$0")/.." && pwd)"      # the frontend/ dir
STAMP="$(date +%Y%m%d-%H%M%S)"

echo "==> [1/3] build (local — server OOMs)"
( cd "$LOCAL" && npm run build )

echo "==> [2/3] ship to release $STAMP (data/env/node_modules excluded)"
ssh -i "$KEY" "$HOST" "mkdir -p /opt/frostbite/mainnet/releases/$STAMP/frontend"
rsync -az --delete \
  --exclude='node_modules' --exclude='data' \
  --exclude='.env' --exclude='.env.local' --exclude='.env.mainnet' --exclude='.env.testnet' \
  -e "ssh -i $KEY" "$LOCAL/" "$HOST:/opt/frostbite/mainnet/releases/$STAMP/frontend/"

echo "==> [3/3] blue-green cutover (remote)"
ssh -i "$KEY" "$HOST" "STAMP=$STAMP bash -s" <<'REMOTE'
set -uo pipefail
ROOT=/opt/frostbite/mainnet
REL=$ROOT/releases/$STAMP/frontend
CUR=$ROOT/current/frontend
NEXT=$CUR/node_modules/.bin/next
NGINX=/etc/nginx/sites-enabled/frostbite-mainnet
KEEP=3
health()  { curl -s -o /dev/null -w '%{http_code}' -m 8 "$1" 2>/dev/null || echo 000; }
waitup()  { local c; for i in $(seq 1 30); do c=$(health "$1"); [ "$c" = 200 ] && return 0; sleep 3; done; return 1; }
nginx_to() { # $1=port ; backup OUTSIDE sites-enabled (nginx would parse it), validate, reload
  local bk=/tmp/frostbite-mainnet.nginx.bak-$STAMP
  cp -f "$NGINX" "$bk"
  sed -i -E "s#(upstream mainnet_upstream \{ server 127\.0\.0\.1:)[0-9]+#\1$1#" "$NGINX"
  if nginx -t 2>/dev/null; then nginx -s reload; rm -f "$bk"; return 0; fi
  cp -f "$bk" "$NGINX"; rm -f "$bk"; return 1
}

# symlink shared + flip current
ln -sfn "$ROOT/frontend/node_modules" "$REL/node_modules"
ln -sfn "$ROOT/shared/data" "$REL/data"
for e in .env .env.local .env.mainnet .env.testnet; do [ -f "$ROOT/shared/$e" ] && ln -sfn "$ROOT/shared/$e" "$REL/$e"; done
PREV=$(readlink "$ROOT/current" 2>/dev/null || true)
ln -sfn "$ROOT/releases/$STAMP" "$ROOT/current"

# start green on new code (:3010)
pm2 delete frostbite-mainnet-green >/dev/null 2>&1 || true
cd "$CUR"; PORT=3010 NODE_ENV=production pm2 start "$NEXT" --name frostbite-mainnet-green --cwd "$CUR" -- start -p 3010 >/dev/null 2>&1
if ! waitup http://127.0.0.1:3010/avalanche/api/health || ! bash "$CUR/scripts/smoke-test.sh" http://127.0.0.1:3010 >/dev/null; then
  echo "!!! GREEN UNHEALTHY — rollback (current->PREV, kill green); traffic never moved"
  pm2 delete frostbite-mainnet-green >/dev/null 2>&1 || true
  [ -n "$PREV" ] && ln -sfn "$PREV" "$ROOT/current"; exit 1
fi

# traffic -> green (graceful, 0 drop)
nginx_to 3010 || { echo "!!! NGINX SWAP FAIL — rollback"; pm2 delete frostbite-mainnet-green >/dev/null 2>&1; [ -n "$PREV" ] && ln -sfn "$PREV" "$ROOT/current"; exit 1; }
echo "traffic on green :3010 (new code)"

# bring blue onto new code (no traffic on it), then swap back to canonical :3000
pm2 restart frostbite-mainnet --update-env >/dev/null 2>&1
if waitup http://127.0.0.1:3000/avalanche/api/health && bash "$CUR/scripts/smoke-test.sh" http://127.0.0.1:3000 >/dev/null; then
  nginx_to 3000 && echo "traffic back on blue :3000 (new code)"
  pm2 delete frostbite-mainnet-green >/dev/null 2>&1 || true
else
  echo "WARN: blue :3000 unhealthy after restart — STAYING on green :3010 (new code is live). Investigate blue."
fi
pm2 save >/dev/null 2>&1 || true

# prune old releases (keep newest KEEP; never the rollback target)
cd "$ROOT/releases" && ls -1dt */ | sed 's#/##' | tail -n +$((KEEP+1)) | while read -r d; do
  [ "$ROOT/releases/$d" != "$PREV" ] && rm -rf "$ROOT/releases/$d"
done
echo "OK  current -> $(readlink "$ROOT/current")  nginx -> $(grep -oE 'mainnet_upstream \{ server 127.0.0.1:[0-9]+' "$NGINX" | grep -oE '[0-9]+$')"
REMOTE
echo "==> deploy $STAMP complete (blue-green, ~0 downtime)"
