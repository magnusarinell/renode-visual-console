#!/usr/bin/env bash
# ------------------------------------------------------------------
# build_daisy.sh — Build a libDaisy example for the Daisy Seed.
#
# Usage:
#   bash scripts/build_daisy.sh                  # build default (seed/Blink)
#   bash scripts/build_daisy.sh seed/UART        # build a specific example
#   bash scripts/build_daisy.sh clean            # clean all build artifacts
# ------------------------------------------------------------------
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXAMPLES_DIR="$ROOT_DIR/submodules/DaisyExamples"
WRAPPER_DIR="$ROOT_DIR/.toolchain-wrappers"

# Default example to build
EXAMPLE="${1:-seed/Blink}"

# ── Pre-flight checks ───────────────────────────────────────────
if [[ ! -d "$EXAMPLES_DIR/libDaisy" ]]; then
    echo "ERROR: DaisyExamples not found at $EXAMPLES_DIR"
    echo "Run:  bash scripts/setup_libdaisy.sh"
    exit 1
fi

# Prepend toolchain wrappers so arm-none-eabi-gcc resolves
if [[ -d "$WRAPPER_DIR" ]]; then
    export PATH="$WRAPPER_DIR:$PATH"
fi

# ── Locate make ─────────────────────────────────────────────────
# Git Bash on Windows does not include make.  Search common locations.
MAKE_CMD=""
for candidate in \
    make \
    mingw32-make \
    "$HOME/scoop/shims/make" \
    "$HOME/scoop/shims/make.exe" \
    "/c/Program Files/Git/usr/bin/make.exe" \
    "/usr/bin/make" \
    "$HOME/zephyr-sdk/zephyr-sdk-0.17.4/hosttools/make.exe" \
    "$(ls ~/zephyr-sdk/zephyr-sdk-*/hosttools/make.exe 2>/dev/null | head -1)";
do
    if command -v "$candidate" >/dev/null 2>&1; then
        MAKE_CMD="$candidate"
        break
    fi
done

if [[ -z "$MAKE_CMD" ]]; then
    echo ""
    echo "ERROR: 'make' not found."
    echo ""
    echo "Install one of the following (no admin required):"
    echo "  Option A — Scoop (recommended):"
    echo "    scoop install make"
    echo ""
    echo "  Option B — Add Git's bundled make to PATH:"
    echo "    export PATH=\"/c/Program Files/Git/usr/bin:\$PATH\""
    echo "    (add this to ~/.bashrc for persistence)"
    echo ""
    echo "  Option C — Reuse Zephyr SDK host tools if make.exe is there:"
    echo "    ls ~/zephyr-sdk/zephyr-sdk-*/hosttools/"
    echo ""
    exit 1
fi
echo "Using make: $MAKE_CMD"

# ── Check arm-none-eabi-gcc after PATH update ────────────────────
if ! command -v arm-none-eabi-gcc >/dev/null 2>&1; then
    echo "ERROR: arm-none-eabi-gcc not found."
    echo "Run:  bash scripts/setup_libdaisy.sh  (creates wrapper scripts)"
    exit 1
fi

# ── Handle 'clean' command ───────────────────────────────────────
if [[ "$EXAMPLE" == "clean" ]]; then
    echo "Cleaning libDaisy…"
    "$MAKE_CMD" -C "$EXAMPLES_DIR/libDaisy" clean 2>/dev/null || true
    echo "Done."
    exit 0
fi

# ── Build libDaisy (if not already built) ────────────────────────
LIBDAISY_LIB="$EXAMPLES_DIR/libDaisy/build/libdaisy.a"
if [[ ! -f "$LIBDAISY_LIB" ]]; then
    echo "Building libDaisy…"
    "$MAKE_CMD" -C "$EXAMPLES_DIR/libDaisy" -j"$(nproc 2>/dev/null || echo 4)"
fi

# ── Build DaisySP (if not already built) ─────────────────────────
DAISYSP_LIB="$EXAMPLES_DIR/DaisySP/build/libdaisysp.a"
if [[ ! -f "$DAISYSP_LIB" ]]; then
    if [[ -d "$EXAMPLES_DIR/DaisySP" ]]; then
        echo "Building DaisySP…"
        "$MAKE_CMD" -C "$EXAMPLES_DIR/DaisySP" -j"$(nproc 2>/dev/null || echo 4)"
    else
        echo "WARNING: DaisySP directory not found at $EXAMPLES_DIR/DaisySP"
        echo "Run:  bash scripts/setup_libdaisy.sh  (re-initialises submodules)"
    fi
fi

# ── Build the requested example ─────────────────────────────────
EXAMPLE_DIR="$EXAMPLES_DIR/$EXAMPLE"
if [[ ! -d "$EXAMPLE_DIR" ]]; then
    echo "ERROR: Example directory not found: $EXAMPLE_DIR"
    echo "Available examples:"
    ls -d "$EXAMPLES_DIR"/seed/*/ 2>/dev/null | sed "s|$EXAMPLES_DIR/||" | head -20
    exit 1
fi

echo "Building $EXAMPLE…"
"$MAKE_CMD" -C "$EXAMPLE_DIR" -j"$(nproc 2>/dev/null || echo 4)"

# ── Locate output ELF ───────────────────────────────────────────
EXAMPLE_NAME="$(basename "$EXAMPLE")"
ELF="$EXAMPLE_DIR/build/$EXAMPLE_NAME.elf"
if [[ -f "$ELF" ]]; then
    echo ""
    echo "Build complete: $ELF"
    echo "To run in Renode:  npm run start:daisy"
else
    echo "WARNING: Expected ELF not found at $ELF"
    echo "Check build output above for errors."
    find "$EXAMPLE_DIR/build" -name "*.elf" 2>/dev/null | head -5
fi
