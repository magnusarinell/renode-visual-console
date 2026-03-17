#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR/zephyr"

if ! command -v west >/dev/null 2>&1 && [[ -f "$HOME/.bashrc" ]]; then
    source "$HOME/.bashrc"
fi

west build -p always -b yd_stm32h750vb daisy -d build-daisy "$@"
