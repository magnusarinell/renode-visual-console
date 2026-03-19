# -*- coding: utf-8 -*-
"""SSD1306 OLED display — SPI1 peripheral stub for Renode (STM32H7 / Daisy Seed).

Peripheral base : 0x40013000, size 0x400  (SPI1)
Framebuffer     : SRAM4 @ 0x38000000, 1024 bytes (128 columns × 8 pages)

STM32H7 SPI v2 register offsets (relevant):
  0x14  SR   – Status register; TXP=bit1, EOT=bit3.
               Stub keeps these permanently set so the HAL never waits.
  0x20  TXDR – TX data FIFO; each byte written here is a display byte.
               All other offsets are silently ignored.

SSD1306 wiring on Daisy Seed (libDaisy default):
  DC/RS = PG10  → GPIOG ODR bit 10 at 0x58021814
                  HIGH = pixel data, LOW = command

SSD1306 page-addressing protocol (used by libDaisy OledDisplay::Update()):
  For each page p in 0..7:
    DC=LOW   byte  0xB0 | p   – set page address
    DC=LOW   byte  0x00       – column low nibble = 0
    DC=LOW   byte  0x10       – column high nibble = 0
    DC=HIGH  128 bytes        – pixel data for this page
  Total: 32 command bytes + 1024 pixel bytes per Update() call.

When all 8 pages are received the stub writes _spi_fb[0..1023] to SRAM4
so the backend can read the framebuffer with:
  python "import base64; d=bytes([machine.SystemBus.ReadByte(0x38000000+i) for i in range(1024)]); print(base64.b64encode(d).decode())"
"""

GPIOG_ODR  = 0x58021814
SRAM4_BASE = 0x38000000

# ── Persistent state (initialised once via try/except NameError) ─────────────
try:
    _spi_page
except NameError:
    _spi_page = 0       # current GDDRAM page (0-7)
    _spi_col  = 0       # current column within page (0-127)
    _spi_fb   = [0] * 1024  # full 128-col × 8-page framebuffer

# SR: TXP (bit 1) | EOT (bit 3) | TXC (bit 12) — always report "ready"
_SR_READY = 0x0000100A

# ── Register access ───────────────────────────────────────────────────────────
if request.IsRead:
    request.Value = _SR_READY if request.Offset == 0x14 else 0

elif request.IsWrite and request.Offset == 0x20:
    byte = request.Value & 0xFF

    # Determine DC pin (HIGH = data, LOW = command)
    try:
        dc_high = bool((self.Machine.SystemBus.ReadDoubleWord(GPIOG_ODR) >> 10) & 1)
    except Exception:
        # Fallback heuristic: SSD1306 page-set (0xB0..0xB7) and column-set
        # (0x00..0x0F, 0x10..0x1F) commands have small values; pixel bytes can
        # be anything, but most data bytes exceed 0x1F during real images.
        dc_high = not ((byte & 0xF8) == 0xB0 or byte < 0x20)

    if dc_high:
        # Pixel byte — store at current page/column
        idx = _spi_page * 128 + _spi_col
        if 0 <= idx < 1024:
            _spi_fb[idx] = byte

        _spi_col += 1
        if _spi_col == 128:
            _spi_col = 0
            if _spi_page == 7:
                # All 8 pages complete — flush framebuffer to SRAM4
                try:
                    for i in range(0, 1024, 4):
                        w = ((_spi_fb[i]         & 0xFF)
                             | ((_spi_fb[i + 1] & 0xFF) << 8)
                             | ((_spi_fb[i + 2] & 0xFF) << 16)
                             | ((_spi_fb[i + 3] & 0xFF) << 24))
                        self.Machine.SystemBus.WriteDoubleWord(SRAM4_BASE + i, w)
                except Exception:
                    pass
            _spi_page = (_spi_page + 1) % 8

    else:
        # Command byte — update internal cursor when page address is set
        if (byte & 0xF8) == 0xB0:   # 0xB0..0xB7: Set GDDRAM page address
            _spi_page = byte & 0x07
            _spi_col  = 0
        elif byte == 0x00 or byte == 0x10:  # column address reset
            _spi_col = 0
