# -*- coding: utf-8 -*-
"""
STM32H7 PWR register stub for Renode.

libDaisy's System::Init() sets voltage scaling (VOS) in PWR_D3CR
and polls PWR_CSR1 for ACTVOSRDY / VOSRDY.  Without these bits
the firmware hangs.

PWR base: 0x5802_4800, size 0x400

Key registers:
  0x000  CR1   — power control 1
  0x004  CSR1  — power status 1
  0x008  CR2   — power control 2
  0x00C  CR3   — power control 3
  0x018  D3CR  — domain 3 control (VOS bits 15:14)
"""

try:
    pwr_regs
except NameError:
    pwr_regs = {}

if request.IsRead:
    offset = request.Offset
    val = pwr_regs.get(offset, 0)

    if offset == 0x004:
        # PWR_CSR1: force ready bits
        #   Bit 13: ACTVOSRDY — active VOS ready
        #   Bit 16: VOSRDY    — VOS ready (legacy, some HAL versions check this)
        val |= (1 << 13) | (1 << 16)
        # ACTVOS (bits 15:14) mirrors VOS from D3CR
        d3cr = pwr_regs.get(0x018, 0)
        vos = (d3cr >> 14) & 0x3
        val = (val & ~(0x3 << 14)) | (vos << 14)
        request.Value = val

    elif offset == 0x018:
        # PWR_D3CR: force VOSRDY (bit 13) so firmware doesn't hang
        # polling __HAL_PWR_GET_FLAG(PWR_FLAG_VOSRDY) which reads D3CR.
        val |= (1 << 13)
        request.Value = val

    else:
        request.Value = val

elif request.IsWrite:
    pwr_regs[request.Offset] = request.Value
