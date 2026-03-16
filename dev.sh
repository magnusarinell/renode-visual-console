#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cmd="${1:-help}"
shift || true

case "$cmd" in
  build-disco)
    bash "$ROOT_DIR/scripts/build_disco.sh" "$@"
    ;;
  renode)
    bash "$ROOT_DIR/scripts/run_renode.sh" "$@"
    ;;
  clean)
    bash "$ROOT_DIR/scripts/clean.sh" "$@"
    ;;
  rebuild)
    bash "$ROOT_DIR/scripts/rebuild.sh" "$@"
    ;;
  build)
    bash "$ROOT_DIR/scripts/build.sh" "$@"
    ;;
  start-backend)
    bash "$ROOT_DIR/scripts/start_backend.sh" "$@"
    ;;
  start-frontend)
    bash "$ROOT_DIR/scripts/start_frontend.sh" "$@"
    ;;
  start)
    npm --prefix "$ROOT_DIR" start
    ;;
  help|-h|--help)
    cat <<'EOF'
Usage: bash dev.sh <command>

Commands:
  build-disco   Build firmware for STM32F4 Discovery (stm32f4_disco, used by Renode)
  build         Build firmware for nucleo_f446re (alternative target)
  renode        Build firmware and start Renode simulation (dual-board)
  clean         Remove Zephyr build directory
  rebuild       Clean then build-disco
  start-backend Start Node.js WebSocket bridge to Renode
  start-frontend Start Vite dev server (frontend)
  start         Start all services via npm start
EOF
    ;;
  *)
    echo "Unknown command: $cmd" >&2
    echo "Run: bash dev.sh help" >&2
    exit 2
    ;;
esac
