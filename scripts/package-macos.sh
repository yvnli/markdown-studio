#!/usr/bin/env bash
# macOS 打包流水线：构建 → .app → ad-hoc 签名 → ZIP → DMG
# 每一步都打印进度与耗时，避免"看起来卡住却没有任何输出"。
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
  printf '  ✓ 用时 %ds\n' "$((SECONDS - STEP_START))"
}

# 超时执行：把"无限等待网络"变成可诊断的失败，而不是静默卡死
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

# 每次打包会在 release/ 写入约 400MB 二进制，Spotlight 索引会让整机明显卡顿
mkdir -p "$ROOT/release"
: > "$ROOT/release/.metadata_never_index"

step "1/5 构建前端资源（tsc --noEmit + vite build，约 10–20s，期间无输出属正常）"
npm run build
finish_step

step "2/5 生成 .app（electron-builder --mac dir --arm64）"
export CSC_IDENTITY_AUTO_DISCOVERY=false

BUILDER_ARGS=(--mac dir --arm64 --publish never)
LOCAL_ELECTRON="$ROOT/node_modules/electron/dist"
if [[ -d "$LOCAL_ELECTRON/Electron.app" ]]; then
  # 复用 npm 已装好的 Electron，避免 electron-builder 联网校验/下载
  # （GitHub 连不通时它会卡在 TCP SYN_SENT 且不报错，表现为"构建卡住"）
  LOCAL_ELECTRON_VERSION="$(node -p "require('$ROOT/node_modules/electron/package.json').version")"
  printf '  使用本地 Electron %s（node_modules/electron/dist），跳过联网下载\n' "$LOCAL_ELECTRON_VERSION"
  BUILDER_ARGS+=("--config.electronDist=$LOCAL_ELECTRON")
else
  printf '  未找到本地 Electron，将联网下载；可用 ELECTRON_MIRROR 指定镜像\n'
fi

status=0
run_with_timeout "$BUILDER_TIMEOUT" npx electron-builder "${BUILDER_ARGS[@]}" || status=$?
if (( status == 124 )); then
  printf '  ✗ electron-builder 超过 %ds 仍未结束，已终止。\n' "$BUILDER_TIMEOUT" >&2
  cat >&2 <<'HINT'
最常见原因是下载 Electron 时网络卡住（GitHub release 资源连不通）：
  · 确认 node_modules/electron/dist/Electron.app 存在，脚本会自动改用它；
  · 或设置镜像后重试：ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm run dist:mac
  · 也可放宽超时：BUILDER_TIMEOUT=1800 npm run dist:mac
HINT
  exit 1
elif (( status != 0 )); then
  exit "$status"
fi
finish_step

APP="$ROOT/release/mac-arm64/Markdown studio.app"
if [[ ! -d "$APP" ]]; then
  echo "✗ 未生成 $APP" >&2
  exit 1
fi

step "3/5 ad-hoc 签名并校验 .app（codesign --deep，约 1–3s）"
codesign --force --deep --sign - "$APP"
codesign --verify --deep --strict "$APP"
finish_step

step "4/5 打包 ZIP（ditto 压缩 267MB，约 5–15s）"
ZIP="$ROOT/release/Markdown-studio-$VERSION-arm64.zip"
rm -f "$ZIP"
ditto -c -k --sequesterRsrc --keepParent "$APP" "$ZIP"
printf '  Created %s\n' "$ZIP"
finish_step

step "5/5 生成 DMG（约 10–60s，期间无输出属正常）"
if bash "$ROOT/scripts/make-dmg.sh"; then
  finish_step
else
  printf '  ⚠ DMG 未生成（详见上方原因），.app 与 .zip 仍然有效。\n' >&2
fi

printf '\n全部完成，总耗时 %ds。产物：\n' "$((SECONDS - TOTAL_START))"
for f in "$APP" "$ZIP" "$ROOT/release/Markdown-studio-$VERSION-arm64.dmg"; do
  [[ -e "$f" ]] && printf '  %-58s %s\n' "${f#"$ROOT"/}" "$(du -sh "$f" | cut -f1)"
done
