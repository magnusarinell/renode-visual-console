# -*- coding: utf-8 -*-
"""
STM32H7 RCC / PWR / FLASH register stubs for Renode.

libDaisy's System::Init() configures clocks (HSE → PLL) and polls
ready-flags in RCC_CR, RCC_CFGR, PWR_CSR1, and FLASH_ACR.
Renode's built-in STM32H7 RCC model does not set these ready bits,
causing the firmware to hang in busy-wait loops.

This Python peripheral intercepts the register space and forces
the relevant ready/status bits so that clock init succeeds.

Register map (offsets from each peripheral base):

RCC  (0x5802_4400):
  0x000  CR       — clock control (HSI/HSE/PLL ready flags)
  0x010  CFGR     — clock config  (SWS mirrors SW)
  0x028  D1CCIPR  — domain 1 kernel clock config
  0x02C  D2CCIP1R — domain 2 kernel clock config 1
  0x030  D2CCIP2R — domain 2 kernel clock config 2
  0x034  D3CCIPR  — domain 3 kernel clock config
  0x074  AHB3ENR  — AHB3 peripheral clock enable
  0x0D4  AHB3LPENR — AHB3 low-power clock enable
  0x0F4  APB4ENR  — APB4 peripheral clock enable
  etc.

PWR  (0x5802_4800):
  0x000  CR1      — power control 1
  0x004  CSR1     — power status 1 (ACTVOSRDY, VOSRDY)
  0x008  CR2      — power control 2
  0x00C  CR3      — power control 3
  0x018  D3CR     — domain 3 control (VOS)

FLASH (0x5200_2000):
  0x000  ACR      — access control (latency / wait-states)
  0x004  KEYR1
  0x01C  SR1      — status register 1
  etc.

SYSCFG (0x5800_0400):
  0x020  PMCR     — peripheral mode config (MII/RMII, analog switch boost, etc.)
  Other registers pass through.
"""

# ---------------------------------------------------------------------------
#  RCC stub  —  base 0x5802_4400, size 0x400
# ---------------------------------------------------------------------------

try:
    rcc_regs
except NameError:
    rcc_regs = {}
    # Reset-like default for RCC_CR: HSION + HSIRDY + HSIDIVF
    # (HSIDIV defaults to /1 after reset with HSIDIVF=1)
    rcc_regs[0x000] = 0x00000025  # HSION(0) | HSIRDY(2) | HSIDIVF(5)
    rcc_regs[0x010] = 0x00000000  # CFGR

if request.IsRead:
    offset = request.Offset
    val = rcc_regs.get(offset, 0)

    if offset == 0x000:
        # RCC_CR: force all ready bits that have a corresponding enable bit
        # STM32H7 RCC_CR bit positions (from stm32h750xx.h):
        #   bit  0: HSION       bit  2: HSIRDY
        #   bit  7: CSION       bit  8: CSIRDY
        #   bit 12: HSI48ON     bit 13: HSI48RDY
        #   bit 16: HSEON       bit 17: HSERDY
        #   bit 24: PLL1ON      bit 25: PLL1RDY
        #   bit 26: PLL2ON      bit 27: PLL2RDY
        #   bit 28: PLL3ON      bit 29: PLL3RDY
        rdy_map = {0: 2, 7: 8, 12: 13, 16: 17, 24: 25, 26: 27, 28: 29}
        for on_bit, rdy_bit in rdy_map.items():
            if val & (1 << on_bit):
                val |= (1 << rdy_bit)
            else:
                val &= ~(1 << rdy_bit)
        # HSI is always ready in simulation
        val |= (1 << 2)
        request.Value = val

    elif offset == 0x010:
        # RCC_CFGR: SWS (bits 5:3) should mirror SW (bits 2:0)
        sw = val & 0x7
        val = (val & ~(0x7 << 3)) | (sw << 3)
        request.Value = val

    else:
        request.Value = val

elif request.IsWrite:
    offset = request.Offset
    rcc_regs[offset] = request.Value
