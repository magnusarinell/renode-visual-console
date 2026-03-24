# -*- coding: utf-8 -*-
"""
STM32H7 ADC1/ADC2 master-slave register stub for Renode.

Peripheral base : 0x40022000, size 0x400
  ADC1 instance   : offsets 0x000 – 0x0FF
  ADC2 instance   : offsets 0x100 – 0x1FF
  ADC12 common    : offsets 0x300 – 0x3FF

Why this stub exists:
  Renode ships the STM32F0_ADC model (CHSELR-based channel selection)
  which has a register layout incompatible with the STM32H7 ADC
  (PCSEL + SQR1–4 channel preselection / sequencing).
  libDaisy's HAL driver writes to H7-specific registers and polls
  status bits that STM32F0_ADC never sets, causing the firmware to
  hang in HAL_ADCEx_Calibration_Start() and ADC_Enable().

What this stub does:
  - Stores all register writes in a dictionary
  - CR:  ADCAL clears instantly (calibration complete)
         ADEN  sets ADRDY in ISR          (ADC enabled)
         ADVREGEN stored                  (regulator on)
  - ISR: returns ADRDY|EOC|EOS|LDORDY when appropriate
         write-1-to-clear semantics (auto-regenerated)
  - DR:  returns stored sample value (default 0)
  - All other registers: passthrough store/return

Note on ADC data injection:
  The firmware (Knob.cpp) uses DMA to transfer from ADC_DR to
  adc1_dma_buffer[] in D2 SRAM.  Since this stub cannot trigger
  DMA requests, the backend writes directly to the DMA buffer.
  The buffer address is read from DMA1_Stream2 M0AR register
  (0x4002004C) after firmware initialises DMA.

STM32H7 ADC register map (key offsets per instance):
  0x00  ISR        0x04  IER        0x08  CR         0x0C  CFGR
  0x10  CFGR2      0x14  SMPR1      0x18  SMPR2      0x1C  PCSEL
  0x20  LTR1       0x24  HTR1       0x2C  SQR1       0x30  SQR2
  0x34  SQR3       0x38  SQR4       0x40  DR         0x44  (rsvd)
  0xC4  CALFACT    0xC8  CALFACT2

Common (offset 0x300):
  0x00  CSR        0x08  CCR        0x0C  CDR
"""

# ── Persistent state (survives across script invocations) ──────────
try:
    _adc_regs
except NameError:
    _adc_regs = {}               # offset → value
    _adc_enabled = [False, False] # per-instance (ADC1, ADC2)
    _adc_started = [False, False]
    _adc_sample  = [0, 0]        # injectable DR value per instance

# ── Decode instance ────────────────────────────────────────────────
offset = request.Offset

if offset >= 0x300:
    inst = 2          # common registers
    local = offset - 0x300
elif offset >= 0x100:
    inst = 1          # ADC2
    local = offset - 0x100
else:
    inst = 0          # ADC1
    local = offset

# ── READ ───────────────────────────────────────────────────────────
if request.IsRead:
    if inst < 2:
        if local == 0x00:
            # ISR — auto-generate status flags based on ADC state
            val = 0
            if _adc_enabled[inst]:
                val |= 0x0001   # ADRDY
                val |= 0x1000   # LDORDY (internal regulator ready)
            if _adc_started[inst]:
                val |= 0x0002   # EOSMP (end of sampling)
                val |= 0x0004   # EOC   (end of conversion)
                val |= 0x0008   # EOS   (end of sequence)
            request.Value = val

        elif local == 0x08:
            # CR — ADCAL always reads cleared (calibration complete)
            val = _adc_regs.get(offset, 0)
            val &= ~(1 << 31)  # clear ADCAL
            # ADVREGEN should read back as set if firmware wrote it
            request.Value = val

        elif local == 0x40:
            # DR — return stored sample value
            request.Value = _adc_sample[inst]

        else:
            request.Value = _adc_regs.get(offset, 0)
    else:
        # Common registers (CSR, CCR, CDR)
        if local == 0x00:
            # CSR — mirror individual ISR flags
            val = 0
            if _adc_enabled[0]:
                val |= 0x0001   # ADRDY_MST
            if _adc_started[0]:
                val |= 0x0004   # EOC_MST
            request.Value = val
        else:
            request.Value = _adc_regs.get(offset, 0)

# ── WRITE ──────────────────────────────────────────────────────────
elif request.IsWrite:
    _adc_regs[offset] = request.Value

    if inst < 2:
        if local == 0x00:
            # ISR — write-1-to-clear (flags auto-regenerate, nothing to do)
            pass

        elif local == 0x08:
            # CR — handle control bits
            val = request.Value

            # ADCAL: calibration starts and completes instantly
            if val & (1 << 31):
                _adc_regs[offset] = val & ~(1 << 31)

            # ADEN: enable ADC → ADRDY will be set on next ISR read
            if val & (1 << 0):
                _adc_enabled[inst] = True

            # ADDIS: disable ADC
            if val & (1 << 1):
                _adc_enabled[inst] = False
                _adc_started[inst] = False

            # ADSTART: start regular conversion
            if val & (1 << 2):
                _adc_started[inst] = True

            # ADSTP: stop conversion
            if val & (1 << 4):
                _adc_started[inst] = False
                _adc_regs[offset] = _adc_regs.get(offset, 0) & ~(1 << 4)

        elif local == 0x40:
            # DR write — treat as sample injection
            _adc_sample[inst] = request.Value & 0xFFFF
