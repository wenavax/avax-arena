#!/usr/bin/env bash
# Release-based, zero-data-risk deploy for frostbite-mainnet (Avalanche prod).
#
# Model (since 2026-07-25 cutover):
#   /opt/frostbite/mainnet/
#     shared/{data,.env*}        <- live SQLite DB + uploads + secrets (single copy)
#     frontend/node_modules      <- node_modules "home" (releases symlink to it)
#     releases/<stamp>/frontend  <- immutable per-deploy build
#     current -> releases/<stamp> <- atomic symlink; PM2 cwd points through it
#
# Build happens LOCALLY (the server OOMs on build). We rsync into a FRESH release
# dir — data/uploads/env are never in the tree, so `--delete` cannot touch them
# (structural safety, not a hand-maintained exclude list). Then symlink shared
# state, flip `current`, restart PM2 (cwd is the `current` symlink, so it
# re-resolves to the new release), and smoke. Rollback = flip `current` back.
#
# Usage:  ./scripts/deploy-mainnet.sh
# NOTE:   if package-lock changed, run `npm ci` in $NM_HOME on the server first.
set -euo pipefail

KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519}"
HOST="${DEPLOY_HOST:-root@5.189.173.167}"
ROOT=/opt/frostbite/mainnet
NM_HOME="$ROOT/frontend/node_modules"          # node_modules home; releases symlink here
LOCAL="$(cd "$(dirname "$0")/.." && pwd)"      # the frontend/ dir
STAMP="$(date +%Y%m%d-%H%M%S)"
REL="$ROOT/releases/$STAMP/frontend"
KEEP=3                                          # releases to retain (plus current)

echo "==> [1/4] build (local — server OOMs)"
( cd "$LOCAL" && npm run build )

echo "==> [2/4] ship to release $STAMP (data/env/node_modules excluded)"
ssh -i "$KEY" "$HOST" "mkdir -p $REL"
rsync -az --delete \
  --exclude='node_modules' --exclude='data' \
  --exclude='.env' --exclude='.env.local' --exclude='.env.mainnet' --exclude='.env.testnet' \
  -e "ssh -i $KEY" "$LOCAL/" "$HOST:$REL/"

echo "==> [3/4] symlink shared + flip current + restart + smoke"
ssh -i "$KEY" "$HOST" "STAMP=$STAMP ROOT=$ROOT REL=$REL NM_HOME=$NM_HOME KEEP=$KEEP bash -s" <<'REMOTE'
set -euo pipefail
ln -sfn "$NM_HOME" "$REL/node_modules"
ln -sfn "$ROOT/shared/data" "$REL/data"
for e in .env .env.local .env.mainnet .env.testnet; do
  [ -f "$ROOT/shared/$e" ] && ln -sfn "$ROOT/shared/$e" "$REL/$e"
done
PREV="$(readlink "$ROOT/current" 2>/dev/null || true)"
ln -sfn "$ROOT/releases/$STAMP" "$ROOT/current"
pm2 restart frostbite-mainnet --update-env >/dev/null
sleep 2
if bash "$ROOT/current/frontend/scripts/smoke-test.sh" http://127.0.0.1:3000; then
  echo "SMOKE OK — current -> $(readlink "$ROOT/current")"
  pm2 save >/dev/null 2>&1 || true
  # prune old releases (keep newest KEEP), never current or the rollback target
  cd "$ROOT/releases" && ls -1dt */ | sed 's#/##' | tail -n +"$((KEEP+1))" | while read -r d; do
    [ "$ROOT/releases/$d" != "$PREV" ] && rm -rf "$ROOT/releases/$d"
  done
else
  echo "!!! SMOKE FAILED — rolling back to $PREV"
  [ -n "$PREV" ] && ln -sfn "$PREV" "$ROOT/current" && pm2 restart frostbite-mainnet --update-env >/dev/null
  exit 1
fi
REMOTE

echo "==> [4/4] deploy $STAMP complete"
