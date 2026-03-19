#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SIM_RESC_UNIX="$ROOT_DIR/renode/discovery/discovery_dual.resc"

bash "$ROOT_DIR/scripts/build_disco.sh"

if command -v cygpath >/dev/null 2>&1; then
  SIM_RESC="$(cygpath -m "$SIM_RESC_UNIX")"
else
  SIM_RESC="$SIM_RESC_UNIX"
fi

renode -e "include @$SIM_RESC"
