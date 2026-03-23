# -*- coding: utf-8 -*-
# ESP32-C3 ROM peripheral stub for Renode simulation.
#
# Loaded as Python.PythonPeripheral replacing the empty rom MappedMemory.
# Returns two consecutive c.jr ra (0x8082) for every 32-bit read so that
# any call into the ROM region immediately returns to the caller.
# esp-idf startup calls several ROM functions (esp_rom_get_reset_reason,
# esp_rom_Cache_Read_Enable, etc.) before app_main; this makes them no-ops.

if request.IsRead:
    request.Value = 0x80828082   # c.jr ra  c.jr ra  (compressed RET × 2)
elif request.IsWrite:
    pass                         # ROM writes are silently ignored
