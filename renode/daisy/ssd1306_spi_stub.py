# -*- coding: utf-8 -*-
# SSD1306 OLED -- SPI1 stub for Renode (IronPython 2, STM32H7 / Daisy Seed)
#
# Peripheral base : 0x40013000, size 0x400  (SPI1)
#
# STM32H7 SPI v2 registers used:
#   0x14  SR   - TXP|EOT|TXC always set so HAL never busy-waits
#   0x20  TXDR - each byte written here is captured
#
# Protocol (libDaisy OledDisplay::Update(), page-addressing mode):
#   For each page p 0..7:
#     0xB0|p   set-page command
#     0x00     set column low nibble  = 0
#     0x10     set column high nibble = 0
#     [128 bytes of pixel data]
#
# State machine: after 0xB0|p we count 2 more command bytes then switch to
# data-collection mode for 128 bytes.  No GPIO / DC-pin read needed.
#
# After page 7 the complete 1024-byte framebuffer is flushed to
# {tempdir}/renode_oled_frame.bin for the backend to read.

_SR_READY = 0x0000100A

try:
    _spi_page
except NameError:
    _spi_page     = 0
    _spi_col      = 0
    _spi_preamble = -1   # -1=idle/cmd  >0=eating preamble bytes  0=data phase
    _spi_fb       = [0] * 1024
    import tempfile as _tf, os as _os
    _FRAME_PATH = _os.path.join(_tf.gettempdir(), 'renode_oled_frame.bin')

if request.IsRead:
    request.Value = _SR_READY if request.Offset == 0x14 else 0

elif request.IsWrite and request.Offset == 0x20:
    byte = request.Value & 0xFF

    if _spi_preamble > 0:
        # Eating the two per-page command bytes (0x00, 0x10)
        _spi_preamble -= 1

    elif _spi_preamble == 0:
        # Data phase: collect 128 pixel bytes for current page
        idx = _spi_page * 128 + _spi_col
        if 0 <= idx < 1024:
            _spi_fb[idx] = byte
        _spi_col += 1
        if _spi_col == 128:
            _spi_col = 0
            if _spi_page == 7:
                try:
                    _f = open(_FRAME_PATH, 'wb')
                    _f.write(bytearray(_spi_fb))
                    _f.close()
                except Exception:
                    pass
            _spi_page = (_spi_page + 1) % 8
            _spi_preamble = -1  # back to command/idle state

    else:
        # Idle/command state (_spi_preamble == -1)
        if (byte & 0xF8) == 0xB0:
            _spi_page = byte & 0x07
            _spi_col  = 0
            _spi_preamble = 2   # still need 0x00 and 0x10 before data
