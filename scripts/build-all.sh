#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="${ROOT_DIR}/build"

log() {
  printf '\n[%s] %s\n' "$(date +'%H:%M:%S')" "$*"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Error: '$1' not found in PATH." >&2
    exit 1
  fi
}

require_cmd cmake
require_cmd npm

log "Configuring C++ project (cmake)..."
cmake -S "${ROOT_DIR}" -B "${BUILD_DIR}"

log "Building multicode_core + tests..."
cmake --build "${BUILD_DIR}"

BUILD_CONFIG="${BUILD_CONFIG:-Debug}"

log "Running ctest suite (config: ${BUILD_CONFIG})..."
ctest --test-dir "${BUILD_DIR}" --output-on-failure -C "${BUILD_CONFIG}"

log "Building VS Code extension..."
pushd "${ROOT_DIR}/vscode-extension" >/dev/null
if [ ! -d node_modules ]; then
  log "Installing npm dependencies..."
  npm install
fi
npm run compile
popd >/dev/null

log "Done."
