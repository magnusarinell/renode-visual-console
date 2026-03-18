#!/usr/bin/env bash
# ------------------------------------------------------------------
# setup_libdaisy.sh — Clone DaisyExamples + libDaisy and create
#                     toolchain wrapper symlinks so the libDaisy
#                     Makefile (which expects arm-none-eabi-*) can
#                     use the Zephyr SDK's arm-zephyr-eabi-* tools.
# ------------------------------------------------------------------
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXAMPLES_DIR="$ROOT_DIR/libdaisy-examples"

# ── 1. Clone DaisyExamples (includes libDaisy as submodule) ──────
if [[ -d "$EXAMPLES_DIR/.git" ]]; then
    echo "DaisyExamples already cloned at $EXAMPLES_DIR"
else
    echo "Cloning DaisyExamples…"
    git clone --depth 1 https://github.com/electro-smith/DaisyExamples.git "$EXAMPLES_DIR"
fi

echo "Initialising submodules (libDaisy, CMSIS)…"
cd "$EXAMPLES_DIR"
git submodule update --init --recursive --depth 1

# ── 2. Locate the Zephyr SDK ARM toolchain ──────────────────────
ZEPHYR_SDK="${ZEPHYR_SDK_INSTALL_DIR:-}"
if [[ -z "$ZEPHYR_SDK" ]]; then
    # Fallback: look for it in the common location
    for sdk in "$HOME"/zephyr-sdk/zephyr-sdk-* "$HOME"/zephyr-sdk-*; do
        if [[ -d "$sdk/arm-zephyr-eabi/bin" ]]; then
            ZEPHYR_SDK="$sdk"
            break
        fi
    done
fi

if [[ -z "$ZEPHYR_SDK" || ! -d "$ZEPHYR_SDK/arm-zephyr-eabi/bin" ]]; then
    echo "ERROR: Could not find Zephyr SDK ARM toolchain."
    echo "Set ZEPHYR_SDK_INSTALL_DIR or install arm-none-eabi-gcc separately."
    exit 1
fi

ZEPHYR_TC="$ZEPHYR_SDK/arm-zephyr-eabi/bin"
echo "Zephyr SDK ARM toolchain found at: $ZEPHYR_TC"

# ── 3. Create arm-none-eabi-* wrapper symlinks ──────────────────
WRAPPER_DIR="$ROOT_DIR/.toolchain-wrappers"
mkdir -p "$WRAPPER_DIR"

# Remove stale wrappers
rm -f "$WRAPPER_DIR"/arm-none-eabi-*

for tool in "$ZEPHYR_TC"/arm-zephyr-eabi-*; do
    base="$(basename "$tool")"
    target_name="${base/arm-zephyr-eabi/arm-none-eabi}"
    # On Windows/MSYS, symlinks may not work; copy or create a wrapper script
    if [[ "$(uname -s)" == MINGW* || "$(uname -s)" == MSYS* ]]; then
        cat > "$WRAPPER_DIR/$target_name" <<WRAP
#!/usr/bin/env bash
exec "$tool" "\$@"
WRAP
        chmod +x "$WRAPPER_DIR/$target_name"
    else
        ln -sf "$tool" "$WRAPPER_DIR/$target_name"
    fi
done

echo "Toolchain wrappers created in $WRAPPER_DIR"
echo ""

# ── 4. Check for make ────────────────────────────────────────────
# Git Bash on Windows does not include make.  Check common locations.
MAKE_FOUND=false
for candidate in make mingw32-make "$HOME/scoop/shims/make" "$HOME/scoop/shims/make.exe" "/c/Program Files/Git/usr/bin/make.exe"; do
    if command -v "$candidate" >/dev/null 2>&1; then
        MAKE_FOUND=true
        echo "make found: $(command -v "$candidate")"
        break
    fi
done

# Also check if it's in Git's usr/bin (not always on PATH in Git Bash)
GIT_MAKE="/c/Program Files/Git/usr/bin/make.exe"
if [[ "$MAKE_FOUND" == false && -f "$GIT_MAKE" ]]; then
    MAKE_FOUND=true
    echo "make found at: $GIT_MAKE"
    echo "  → Add to PATH permanently:"
    echo "    echo 'export PATH=\"/c/Program Files/Git/usr/bin:\$PATH\"' >> ~/.bashrc"
fi

if [[ "$MAKE_FOUND" == false ]]; then
    echo ""
    echo "WARNING: 'make' not found.  Build will fail without it."
    echo ""
    echo "Install one of the following (no admin required):"
    echo "  Option A — Scoop (recommended, no admin):"
    echo "    scoop install make"
    echo ""
    echo "  Option B — Add Git's bundled usr/bin/make to PATH:"
    echo "    echo 'export PATH=\"/c/Program Files/Git/usr/bin:\$PATH\"' >> ~/.bashrc"
    echo "    source ~/.bashrc"
    echo ""
fi

echo "── Setup complete ──"
echo "To build libDaisy + Blink example, run:"
echo "  bash scripts/build_daisy.sh"
