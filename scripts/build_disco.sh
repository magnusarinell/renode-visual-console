#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR/zephyr"

if ! command -v west >/dev/null 2>&1 && [[ -f "$HOME/.bashrc" ]]; then
	# Ensure PATH from user shell is available when script is launched non-interactively.
	# shellcheck disable=SC1090
	source "$HOME/.bashrc"
fi

# Renode's STM32F4 model matches this board profile better than nucleo_f446re.
west build -p always -b stm32f4_disco app "$@"
