# -*- coding: utf-8 -*-
"""
STM32H7 QUADSPI register stub for Renode.

libDaisy's DaisySeed::Init() initialises the external QSPI NOR flash
(IS25LP080D).  The HAL uses auto-polling mode that spins on the Status
Match Flag (SMF, bit 3 of QUADSPI_SR).  Without a real flash model the
auto-polling never completes, and firmware hangs.

This stub forces the status register to report:
  BUSY = 0  (bit 5)  -- ready for new operations
  TCF  = 1  (bit 1)  -- transfer complete
  FTF  = 1  (bit 2)  -- FIFO threshold reached
  SMF  = 1  (bit 3)  -- status match (auto-polling succeeded)

For data reads (DR, offset 0x20) the stub returns the last-written
PSMAR value so that any auto-poll match condition succeeds.

QUADSPI base: 0x5200_5000, size 0x400

Register map:
  0x00  CR    -- Control
  0x04  DCR   -- Device Configuration
  0x08  SR    -- Status  (forced bits on read)
  0x0C  FCR   -- Flag Clear (write-only, ignored)
  0x10  DLR   -- Data Length
  0x14  CCR   -- Communication Configuration
  0x18  AR    -- Address
  0x1C  ABR   -- Alternate Bytes
  0x20  DR    -- Data (FIFO)
  0x24  PSMKR -- Polling Status Mask
  0x28  PSMAR -- Polling Status Match
  0x2C  PIR   -- Polling Interval
  0x30  LPTR  -- Low-Power Timeout
"""

try:
    qspi_regs
except NameError:
    qspi_regs = {}

SR_FORCED = 0x0E  # TCF | FTF | SMF, BUSY=0

if request.IsRead:
    offset = request.Offset

    if offset == 0x08:
        # SR: always report "idle + complete + match"
        request.Value = SR_FORCED

    elif offset == 0x20:
        # DR: return PSMAR so auto-poll match condition is met
        request.Value = qspi_regs.get(0x28, 0)

    else:
        request.Value = qspi_regs.get(offset, 0)

elif request.IsWrite:
    offset = request.Offset
    if offset == 0x0C:
        pass  # FCR: flag-clear writes ignored (SR is always forced)
    else:
        qspi_regs[offset] = request.Value
