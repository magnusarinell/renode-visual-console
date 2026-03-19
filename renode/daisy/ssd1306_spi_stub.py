# -*- coding: utf-8 -*-
# SSD1306 OLED -- SPI1 stub for Renode (IronPython 2, STM32H7 / Daisy Seed)
#
# Peripheral base : 0x40013000, size 0x400  (SPI1)
#
# STM32H7 SPI v2 registers used:
#   0x14  SR   - TXP|EOT|TXC always set so HAL never busy-waits
#   0x20  TXDR - each byte written here is captured
#
# SSD1306 wiring (libDaisy default):
#   DC/RS = PG10 -> GPIOG ODR bit 10 at 0x58021814
#   HIGH = pixel data, LOW = command
#
# Protocol (libDaisy OledDisplay::Update()):
#   For each page p 0..7:
#     DC=LOW  0xB0|p  set page
#     DC=LOW  0x00    col low = 0
#     DC=LOW  0x10    col high = 0
#     DC=HIGH 128 bytes pixel data
#
# On completion of 8 pages the 1024-byte framebuffer is written to
# {tempdir}/renode_oled_frame.bin .  The backend reads that file.

GPIOG_ODR = 0x58021814
_SR_READY = 0x0000100A

try:
    _spi_page
except NameError:
    _spi_page = 0
    _spi_col  = 0
    _spi_fb   = [0] * 1024
    import tempfile as _tf, os as _os
    _FRAME_PATH = _os.path.join(_tf.gettempdir(), 'renode_oled_frame.bin')

if request.IsRead:
    request.Value = _SR_READY if request.Offset == 0x14 else 0

elif request.IsWrite and request.Offset == 0x20:
    byte = request.Value & 0xFF

    try:
        dc_high = bool((self.Machine.SystemBus.ReadDoubleWord(GPIOG_ODR) >> 10) & 1)
    except Exception:
        dc_high = not ((byte & 0xF8) == 0xB0 or byte < 0x20)

    if dc_high:
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
    else:
        if (byte & 0xF8) == 0xB0:
            _spi_page = byte & 0x07
            _spi_col  = 0
        elif byte == 0x00 or byte == 0x10:
            _spi_col = 0
