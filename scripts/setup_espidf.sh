#!/usr/bin/env bash
# ------------------------------------------------------------------
# setup_espidf.sh -- Initialise the esp-idf git submodule and install
#                    the ESP32-C3 toolchain via idf_tools.py.
#
# esp-idf's install.sh and idf_tools.py refuse to run when MSYSTEM is
# set (Git Bash / MSYS2). We bypass that check by unsetting MSYSTEM
# when invoking idf_tools.py directly; the tool itself works fine on
# Windows.
#
# Usage:
#   bash scripts/setup_espidf.sh
# ------------------------------------------------------------------
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IDF_DIR="$ROOT_DIR/submodules/esp-idf"

# esp-idf requires Python 3.8-3.12. Python 3.13+ lacks windows-curses wheels.
# Prefer python3.12 if available (via Scoop: scoop install python312), else python3.
if command -v python3.12 &>/dev/null; then
  PYTHON="python3.12"
elif command -v python3.11 &>/dev/null; then
  PYTHON="python3.11"
else
  PYTHON="python3"
  PY_VER=$(python3 -c "import sys; print(sys.version_info.minor)")
  if [ "$PY_VER" -ge 13 ]; then
    echo "WARNING: Python 3.${PY_VER} detected. esp-idf requires Python ≤ 3.12."
    echo "Run: scoop bucket add versions && scoop install python312"
    echo "Then re-run this script."
    exit 1
  fi
fi
echo "Using Python: $($PYTHON --version)"

# -- 1. Initialise top-level esp-idf submodule -----------------------
echo "Initialising esp-idf submodule..."
cd "$ROOT_DIR"
git submodule update --init --depth 1 -- submodules/esp-idf

# -- 2. Initialise esp-idf's own nested submodules -------------------
echo "Initialising esp-idf component submodules (this may take a while)..."
cd "$IDF_DIR"
git submodule update --init --recursive --depth 1

# -- 3. Patch out the MSYS/MinGW rejection in idf_tools.py ----------
# idf_tools.py refuses to run when MSYSTEM env var is set (Git Bash).
# The check is a soft guardrail for users, not a hard requirement.
# We patch it once; the file is inside a submodule so it is not committed.
IDF_TOOLS="$IDF_DIR/tools/idf_tools.py"
if grep -q "if 'MSYSTEM' in os.environ:" "$IDF_TOOLS"; then
  echo "Patching idf_tools.py: removing MSYS/MinGW rejection..."
  sed -i "s/if 'MSYSTEM' in os.environ:/if False:  # patched for Git Bash/" "$IDF_TOOLS"
fi

# -- 4. Patch out the MSYS/MinGW check in idf.py --------------------
# idf.py has the same guard: when MSYSTEM is set it prints a warning and
# falls through WITHOUT calling main(), so no build ever runs.
# Changing `if 'MSYSTEM' in os.environ:` → `if False:` forces the
# `else: main()` branch to execute on all platforms.
IDF_PY_SCRIPT="$IDF_DIR/tools/idf.py"
if grep -q "if 'MSYSTEM' in os.environ:" "$IDF_PY_SCRIPT"; then
  echo "Patching idf.py: removing MSYS/MinGW no-build bypass..."
  sed -i "s/if 'MSYSTEM' in os.environ:/if False:  # patched for Git Bash/" "$IDF_PY_SCRIPT"
fi

# -- 4. Install ESP32-C3 toolchain via idf_tools.py ------------------
echo "Installing ESP32-C3 toolchain..."
IDF_PATH="$IDF_DIR" "$PYTHON" "$IDF_TOOLS" install --targets esp32c3

# -- 5. Create the Python virtual environment ------------------------
echo "Setting up esp-idf Python virtual environment..."
IDF_PATH="$IDF_DIR" "$PYTHON" "$IDF_TOOLS" install-python-env

echo ""
echo "-- Setup complete --"
echo "esp-idf installed at: $IDF_DIR"
echo "Toolchain and Python env in: ~/.espressif"
echo ""
echo "To build the ESP32-C3 hello_world, run:"
echo "  bash scripts/build_espidf.sh"
