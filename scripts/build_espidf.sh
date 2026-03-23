#!/usr/bin/env bash
# ------------------------------------------------------------------
# build_espidf.sh -- Build the ESP32-C3 hello_world app with idf.py.
#
# Uses the official example directly from the esp-idf submodule:
#   submodules/esp-idf/examples/get-started/hello_world
#
# Usage:
#   bash scripts/build_espidf.sh          # build
#   bash scripts/build_espidf.sh clean    # clean build artifacts
# ------------------------------------------------------------------
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IDF_DIR="$ROOT_DIR/submodules/esp-idf"
APP_DIR="$IDF_DIR/examples/get-started/hello_world"

# -- Pre-flight: check esp-idf submodule is initialised --------------
if [[ ! -f "$IDF_DIR/tools/idf.py" ]]; then
    echo "ERROR: esp-idf not found at $IDF_DIR"
    echo "Run:  bash scripts/setup_espidf.sh"
    exit 1
fi

# -- Source esp-idf environment ---------------------------------------
# We bypass idf_tools.py export entirely: it outputs Windows paths with
# backslashes and semicolons that Git Bash mangles when eval'd.
# Instead, directly glob the installed tool dirs (already Unix-style in
# Git Bash) and prepend them to PATH.
echo "Setting up esp-idf environment..."
export IDF_PATH="$IDF_DIR"
export IDF_TARGETS=esp32c3
ESPRESSIF="$HOME/.espressif"
TOOLS="$ESPRESSIF/tools"

for d in \
    "$TOOLS/riscv32-esp-elf"/*/riscv32-esp-elf/bin \
    "$TOOLS/riscv32-esp-elf-gdb"/*/bin \
    "$TOOLS/cmake"/*/bin \
    "$TOOLS/ninja"/*/ \
    "$TOOLS/ccache"/*/; do
    [[ -d "$d" ]] && export PATH="$d:$PATH"
done

# Add Python venv Scripts so idf.py and its helpers are on PATH
VENV=$(find "$ESPRESSIF/python_env" -maxdepth 1 -name "idf*_py3.12_env" -type d 2>/dev/null | head -1)
if [[ -z "$VENV" ]]; then
    echo "ERROR: Python venv not found. Run: bash scripts/setup_espidf.sh"
    exit 1
fi
export PATH="$VENV/Scripts:$PATH"
# idf.py is a Python script in $IDF_DIR/tools — invoke it via the venv Python
IDF_PY="$VENV/Scripts/python.exe $IDF_DIR/tools/idf.py"

# env vars that export.sh would normally set
export IDF_PYTHON_ENV_PATH="$(cygpath -w "$VENV")"
# derive version from venv dir name (e.g. idf6.1_py3.12_env -> 6.1.0)
IDF_VER_RAW=$(basename "$VENV" | grep -oP '(?<=idf)\d+\.\d+')
export ESP_IDF_VERSION="${IDF_VER_RAW}.0"
export IDF_COMPONENT_MANAGER=1
echo "Environment ready (ESP-IDF $ESP_IDF_VERSION)."

# -- Clean ------------------------------------------------------------
if [[ "${1:-}" == "clean" ]]; then
    echo "Cleaning hello_world..."
    $IDF_PY -C "$APP_DIR" fullclean
    echo "Clean complete."
    exit 0
fi

# -- Configure target on first run ------------------------------------
if [[ ! -f "$APP_DIR/sdkconfig" ]]; then
    echo "Setting target to esp32c3..."
    $IDF_PY -C "$APP_DIR" set-target esp32c3
fi

# -- Build ------------------------------------------------------------
echo "Building hello_world with idf.py..."
$IDF_PY -C "$APP_DIR" build

# -- Report -----------------------------------------------------------
ELF="$APP_DIR/build/hello_world.elf"
if [[ -f "$ELF" ]]; then
    echo ""
    echo "-- Build complete --"
    echo "ELF: $ELF"
    ls -lh "$ELF"
else
    echo "ERROR: ELF not found at expected path: $ELF"
    exit 1
fi
