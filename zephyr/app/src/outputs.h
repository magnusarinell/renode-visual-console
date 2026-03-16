#pragma once
#include <stdint.h>

int app_led_init(void);
void app_led_toggle(void);

int app_outputs_init(void);
int app_output_write(uint32_t index, uint32_t value);
void clear_outputs(void);
void write_pattern(uint8_t pattern);

int app_button_init(void);
int app_button_read(void);

int app_mode_leds_init(void);
void update_mode_leds(uint8_t m);
