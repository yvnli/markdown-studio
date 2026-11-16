#!/usr/bin/env bash
# Build a distributable DMG from release/mac-arm64/Markdown studio.app.
# Write to a temporary file first and replace the old DMG only on success, so a failure
# never destroys existing artifacts.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(node -p "require('$ROOT/package.json').version")"
APP="$ROOT/release/mac-arm64/Markdown studio.app"
OUT="$ROOT/release/Markdown-studio-$VERSION-arm64.dmg"
TMP="$ROOT/release/Markdown-studio-$VERSION-arm64.partial.dmg"
TIMEOUT_SECONDS="${DMG_TIMEOUT:-300}"

if [[ ! -d "$APP" ]]; then
  echo "App bundle not found: $APP" >&2
  echo "Run: npm run desktop:package" >&2
  exit 1
fi

# A leftover mount with the same volume name (interrupted build, or a Finder double-click
# of an older DMG) makes hdiutil fail with the misleading "directory not empty"; eject it.
if [[ -d "/Volumes/Markdown studio" ]]; then
  echo "Ejecting stale volume /Volumes/Markdown studio ..." >&2
  hdiutil detach -force "/Volumes/Markdown studio" >/dev/null 2>&1 || true
fi

STAGE="$(mktemp -d /tmp/markdown-studio-dmg.XXXXXX)"
cleanup() { rm -rf "$STAGE" "$TMP"; }
trap cleanup EXIT

cp -R "$APP" "$STAGE/"
ln -s /Applications "$STAGE/Applications"

run_with_timeout() {
  local limit=$1
  shift
  # stdin from /dev/null: a backgrounded child that reads the terminal is stopped by
  # SIGTTIN and then looks exactly like a hung build (kill -0 keeps succeeding).
  "$@" </dev/null &
  local pid=$!
  local waited=0
  while kill -0 "$pid" 2>/dev/null; do
    if (( waited >= limit )); then
      kill_tree "$pid"
      wait "$pid" 2>/dev/null || true
      return 124
    fi
    sleep 1
    waited=$((waited + 1))
  done
  wait "$pid"
}

kill_tree() {
  local pid=$1
  local child
  for child in $(pgrep -P "$pid" 2>/dev/null || true); do
    kill_tree "$child"
  done
  kill "$pid" 2>/dev/null || true
}

rm -f "$TMP"
status=0
# -nospotlight: skip Spotlight indexing on the temporary volume, so every build doesn't
# trigger a full-disk index
run_with_timeout "$TIMEOUT_SECONDS" \
  hdiutil create -volname "Markdown studio" -srcfolder "$STAGE" \
  -format UDZO -nospotlight "$TMP" || status=$?

if (( status != 0 )); then
  echo "hdiutil create failed (exit code ${status})" >&2
  if (( status == 124 )); then
    echo "Timed out after ${TIMEOUT_SECONDS}s; treating the build as stuck and aborting. Use DMG_TIMEOUT=600 to allow more time." >&2
  fi
  cat >&2 <<'HINT'
Common causes:
  1. Running in a restricted sandbox or managed terminal ("directory not empty" / 目录非空):
     hdiutil needs to create a mount point under /Volumes and fails when that is blocked.
     Run npm run dist:mac from the system Terminal, or use SKIP_DMG=1 to produce only the .app and .zip.
  2. A volume with the same name is still mounted: run hdiutil detach "/Volumes/Markdown studio" and retry.
  3. Not enough disk space (the DMG needs about 300 MB of temporary space).
HINT
  exit 1
fi

status=0
run_with_timeout 120 hdiutil verify "$TMP" >/dev/null || status=$?
if (( status != 0 )); then
  echo "DMG verification failed (exit code ${status})" >&2
  exit 1
fi

mv -f "$TMP" "$OUT"
echo "Created $OUT"
