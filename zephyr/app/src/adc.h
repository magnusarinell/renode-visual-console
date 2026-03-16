#pragma once
#include <stdint.h>

/* blink_interval_ms is written by the simulation backend via memory map */
extern volatile uint32_t blink_interval_ms;

int app_adc_init(void);
