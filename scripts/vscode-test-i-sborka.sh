#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXT_DIR="${ROOT_DIR}/vscode-extension"

SKIP_LINT=0
SKIP_TESTS=0

usage() {
  cat <<'USAGE'
Быстрая проверка VS Code расширения MultiCode.

Использование: scripts/vscode-test-i-sborka.sh [--skip-lint] [--skip-tests]
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-lint)
      SKIP_LINT=1
      shift
      ;;
    --skip-tests)
      SKIP_TESTS=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Неизвестный аргумент: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

log() {
  printf '\n[%s] %s\n' "$(date +'%H:%M:%S')" "$1"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Ошибка: команда '$1' не найдена в PATH." >&2
    exit 1
  fi
}

require_cmd npm
require_cmd node

log "Переходим в каталог расширения..."
cd "${EXT_DIR}"

if [ ! -d node_modules ]; then
  log "Устанавливаем npm-зависимости..."
  npm install
fi

if [ "${SKIP_LINT}" -eq 0 ]; then
  log "Запускаем lint (npm run lint)..."
  npm run lint
else
  log "Lint пропущен по флагу --skip-lint"
fi

log "Собираем вебвью (npm run compile)..."
npm run compile

log "Транспилируем тесты (npm run compile-tests)..."
npm run compile-tests

if [ "${SKIP_TESTS}" -eq 0 ]; then
  log "Запускаем VS Code тесты (node ./out/test/runTest.js)..."
  node ./out/test/runTest.js
else
  log "Тесты пропущены по флагу --skip-tests"
fi

log "Готово. Результаты находятся в директории dist/ и out/."
