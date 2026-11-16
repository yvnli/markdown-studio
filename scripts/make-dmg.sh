#!/usr/bin/env bash
# 从 release/mac-arm64/Markdown studio.app 生成可分发的 DMG。
# 先写入临时文件，成功后才替换旧 DMG：失败不会毁掉已有产物。
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

STAGE="$(mktemp -d /tmp/markdown-studio-dmg.XXXXXX)"
cleanup() { rm -rf "$STAGE" "$TMP"; }
trap cleanup EXIT

cp -R "$APP" "$STAGE/"
ln -s /Applications "$STAGE/Applications"

run_with_timeout() {
  local limit=$1
  shift
  "$@" &
  local pid=$!
  local waited=0
  while kill -0 "$pid" 2>/dev/null; do
    if (( waited >= limit )); then
      kill "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
      return 124
    fi
    sleep 1
    waited=$((waited + 1))
  done
  wait "$pid"
}

rm -f "$TMP"
status=0
# -nospotlight：不给临时卷建 Spotlight 索引，避免每轮打包都触发全盘索引
run_with_timeout "$TIMEOUT_SECONDS" \
  hdiutil create -volname "Markdown studio" -srcfolder "$STAGE" \
  -format UDZO -nospotlight "$TMP" || status=$?

if (( status != 0 )); then
  echo "hdiutil create 失败（退出码 ${status}）" >&2
  if (( status == 124 )); then
    echo "已超过 ${TIMEOUT_SECONDS}s 仍未完成，判定为卡住并终止；可用 DMG_TIMEOUT=600 放宽。" >&2
  fi
  cat >&2 <<'HINT'
常见原因：
  1. 在受限沙箱/受管终端里运行：hdiutil 需要在 /Volumes 下创建挂载点，被拦截时会直接失败；
     请改用系统「终端」执行 npm run dist:mac。
  2. 同名卷仍被挂载：hdiutil unmount "/Volumes/Markdown studio" 后重试。
  3. 磁盘空间不足（DMG 需要约 300MB 临时空间）。
HINT
  exit 1
fi

status=0
run_with_timeout 120 hdiutil verify "$TMP" >/dev/null || status=$?
if (( status != 0 )); then
  echo "DMG 校验失败（退出码 ${status}）" >&2
  exit 1
fi

mv -f "$TMP" "$OUT"
echo "Created $OUT"
