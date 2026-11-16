#!/usr/bin/env bash
# macOS packaging pipeline: build → .app → ad-hoc sign → ZIP → DMG
# Print progress and timing for every step, so a seemingly stuck build still produces output.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
VERSION="$(node -p "require('./package.json').version")"

TOTAL_START=$SECONDS
STEP_START=$TOTAL_START
BUILDER_TIMEOUT="${BUILDER_TIMEOUT:-900}"

step() {
  STEP_START=$SECONDS
  printf '\n▶ %s\n' "$1"
}

finish_step() {
  printf '  ✓ Completed in %ds\n' "$((SECONDS - STEP_START))"
}

# Run with a timeout: turn "waiting on the network forever" into a diagnosable failure
# instead of a silent hang
run_with_timeout() {
  local limit=$1
  shift
  # stdin from /dev/null: a backgrounded child that reads the terminal is stopped by
  # SIGTTIN, which looks exactly like a hung build (kill -0 keeps succeeding).
  "$@" </dev/null &
  local pid=$!
  local waited=0
  while kill -0 "$pid" 2>/dev/null; do
    if (( waited >= limit )); then
      # npx -> npm -> electron-builder -> helpers: kill the whole tree, otherwise the
      # real builder keeps running and holds release/ while the next build starts
      kill_tree "$pid"
      wait "$pid" 2>/dev/null || true
      return 124
    fi
    sleep 1
    waited=$((waited + 1))
  done
  wait "$pid"
}

# Terminate a process and all of its descendants (macOS has no setsid/timeout built in)
kill_tree() {
  local pid=$1
  local child
  for child in $(pgrep -P "$pid" 2>/dev/null || true); do
    kill_tree "$child"
  done
  kill "$pid" 2>/dev/null || true
}

# Each build writes about 400 MB of binaries into release/; Spotlight indexing would make
# the whole machine noticeably sluggish
mkdir -p "$ROOT/release"
: > "$ROOT/release/.metadata_never_index"

step "1/5 Build front-end assets (tsc --noEmit + vite build, about 10–20s; no output during this step is normal)"
npm run build
finish_step

step "2/5 Generate .app (electron-builder --mac dir --arm64)"
export CSC_IDENTITY_AUTO_DISCOVERY=false

# A stage dir left behind by an interrupted build (electron-builder renames it to
# "<productName>.app" as the last packing step) must not be reused as-is
rm -rf "$ROOT/release/mac-arm64/Electron.app"

BUILDER_ARGS=(--mac dir --arm64 --publish never)
LOCAL_ELECTRON="$ROOT/node_modules/electron/dist"
if [[ -d "$LOCAL_ELECTRON/Electron.app" ]]; then
  # Reuse the Electron already installed by npm, so electron-builder doesn't check or
  # download it online
  # (when GitHub is unreachable it hangs in TCP SYN_SENT without an error, which looks
  # like a stuck build)
  LOCAL_ELECTRON_VERSION="$(node -p "require('$ROOT/node_modules/electron/package.json').version")"
  printf '  Using local Electron %s (node_modules/electron/dist), skipping the network download\n' "$LOCAL_ELECTRON_VERSION"
  BUILDER_ARGS+=("--config.electronDist=$LOCAL_ELECTRON")
else
  printf '  No local Electron found; downloading from the network. Set ELECTRON_MIRROR to use a mirror\n'
fi

# electron-builder only collects "dependencies"; this project bundles everything into dist/
# with Vite, so it logs "no node modules returned while searching directories" and keeps
# going. That message is informational, not a failure (see package.json's empty dependencies).
status=0
run_with_timeout "$BUILDER_TIMEOUT" npx electron-builder "${BUILDER_ARGS[@]}" || status=$?
if (( status == 124 )); then
  printf '  ✗ electron-builder did not finish within %ds and was terminated.\n' "$BUILDER_TIMEOUT" >&2
  cat >&2 <<'HINT'
The most common cause is a stalled network while downloading Electron (GitHub release
assets are unreachable):
  · Check that node_modules/electron/dist/Electron.app exists; the script will use it automatically.
  · Or set a mirror and retry: ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm run dist:mac
  · You can also allow more time: BUILDER_TIMEOUT=1800 npm run dist:mac
HINT
  exit 1
elif (( status != 0 )); then
  exit "$status"
fi
finish_step

APP="$ROOT/release/mac-arm64/Markdown studio.app"
if [[ ! -d "$APP" ]]; then
  echo "✗ $APP was not generated" >&2
  exit 1
fi

step "3/5 Ad-hoc sign and verify .app (codesign --deep, about 1–3s)"
codesign --force --deep --sign - "$APP"
codesign --verify --deep --strict "$APP"
finish_step

step "4/5 Package ZIP (ditto compresses 267 MB, about 5–15s)"
ZIP="$ROOT/release/Markdown-studio-$VERSION-arm64.zip"
rm -f "$ZIP"
ditto -c -k --sequesterRsrc --keepParent "$APP" "$ZIP"
printf '  Created %s\n' "$ZIP"
finish_step

DMG_OK=0
step "5/5 Generate DMG (about 10–60s; no output during this step is normal)"
if [[ "${SKIP_DMG:-0}" == "1" ]]; then
  printf '  ⏭ Skipped because SKIP_DMG=1 (.app and .zip above are the deliverables)\n'
elif bash "$ROOT/scripts/make-dmg.sh"; then
  DMG_OK=1
  finish_step
else
  printf '  ⚠ DMG was not generated (see the reason above); the .app and .zip are still valid.\n' >&2
fi

printf '\nAll done in %ds. Artifacts:\n' "$((SECONDS - TOTAL_START))"
ARTIFACTS=("$APP" "$ZIP")
DMG="$ROOT/release/Markdown-studio-$VERSION-arm64.dmg"
# Only advertise a DMG this run actually produced (an old one may still be on disk)
if (( DMG_OK )); then
  ARTIFACTS+=("$DMG")
fi
for f in "${ARTIFACTS[@]}"; do
  [[ -e "$f" ]] && printf '  %-58s %s\n' "${f#"$ROOT"/}" "$(du -sh "$f" | cut -f1)"
done
