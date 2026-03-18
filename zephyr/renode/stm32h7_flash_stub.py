# -*- coding: utf-8 -*-
"""
STM32H7 FLASH register stub for Renode.

libDaisy's HAL configures flash latency (wait-states) through
FLASH_ACR and then reads back to verify.  If the register is
not modelled the HAL loops forever.

FLASH base: 0x5200_2000, size 0x400

Key registers:
  0x000  ACR    — access control (latency, prefetch, etc.)
  0x004  KEYR1  — key register bank 1
  0x008  OPTKEYR — option key register
  0x00C  CR1    — control register bank 1
  0x010  SR1    — status register bank 1
  0x014  CCR1   — clear control register bank 1
  etc.
"""

try:
    flash_regs
except NameError:
    flash_regs = {}

if request.IsRead:
    offset = request.Offset

    if offset == 0x010 or offset == 0x050:
        # SR1 / SR2: report no errors, not busy (BSY=0, QW=0)
        request.Value = 0
    else:
        request.Value = flash_regs.get(offset, 0)

elif request.IsWrite:
    flash_regs[request.Offset] = request.Value
