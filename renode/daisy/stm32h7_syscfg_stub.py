# -*- coding: utf-8 -*-
"""
STM32H7 SYSCFG register stub for Renode.

libDaisy's HAL touches SYSCFG_PMCR during Ethernet/analog-switch
init.  Without a model Renode logs warnings and reads back zero,
which can confuse readback-verification loops.

SYSCFG base: 0x5800_0400, size 0x400                         
"""

try:
    syscfg_regs
except NameError:
    syscfg_regs = {}

if request.IsRead:
    request.Value = syscfg_regs.get(request.Offset, 0)

elif request.IsWrite:
    syscfg_regs[request.Offset] = request.Value
