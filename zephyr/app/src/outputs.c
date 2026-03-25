#include "outputs.h"
#include <zephyr/kernel.h>
#include <zephyr/device.h>
#include <zephyr/drivers/gpio.h>

/* Nucleo F411RE:
 *   led0 = LD2 (PA5) — toggled by received TOGGLE_1 command
 *   led1..3 = PB12/PB13/PB14 (Morpho CN7) — driven by main loop chase pattern
 */
static const struct gpio_dt_spec led  = GPIO_DT_SPEC_GET(DT_ALIAS(led0), gpios);
static const struct gpio_dt_spec led1 = GPIO_DT_SPEC_GET_OR(DT_ALIAS(led1), gpios, {0});
static const struct gpio_dt_spec led2 = GPIO_DT_SPEC_GET_OR(DT_ALIAS(led2), gpios, {0});
static const struct gpio_dt_spec led3 = GPIO_DT_SPEC_GET_OR(DT_ALIAS(led3), gpios, {0});

static const struct gpio_dt_spec button = GPIO_DT_SPEC_GET(DT_ALIAS(sw0), gpios);

static const struct gpio_dt_spec *const outputs[] = {
    &led,   /* index 0: LD2/PA5 — TOGGLE_1 indicator */
    &led1,  /* index 1: PB12 */
    &led2,  /* index 2: PB13 */
    &led3,  /* index 3: PB14 */
};

/* ── LED ── */

int app_led_init(void)
{
    if (!gpio_is_ready_dt(&led)) {
        return -1;
    }
    return gpio_pin_configure_dt(&led, GPIO_OUTPUT_INACTIVE);
}

void app_led_toggle(void)
{
    gpio_pin_toggle_dt(&led);
}

/* ── Outputs ── */

int app_outputs_init(void)
{
    int configured = 0;
    for (size_t i = 0; i < ARRAY_SIZE(outputs); i++) {
        const struct gpio_dt_spec *spec = outputs[i];
        if (spec->port == NULL) continue;
        if (!gpio_is_ready_dt(spec)) continue;
        if (gpio_pin_configure_dt(spec, GPIO_OUTPUT_INACTIVE) == 0) {
            configured++;
        }
    }
    return configured;
}

int app_output_write(uint32_t index, uint32_t value)
{
    if (index >= ARRAY_SIZE(outputs)) return -1;
    const struct gpio_dt_spec *spec = outputs[index];
    if (spec->port == NULL || !gpio_is_ready_dt(spec)) return -2;
    return gpio_pin_set_dt(spec, value ? 1 : 0);
}

void clear_outputs(void)
{
    for (uint32_t i = 0; i < ARRAY_SIZE(outputs); i++) {
        app_output_write(i, 0);
    }
}

void write_pattern(uint8_t pattern)
{
    /* outputs[0] = LD2 reserved for TOGGLE_1 rx; drive led1..3 with 3-bit pattern */
    for (uint32_t i = 1; i < ARRAY_SIZE(outputs); i++) {
        app_output_write(i, (pattern >> (i - 1)) & 0x1);
    }
}

/* ── Button ── */

int app_button_init(void)
{
    if (!gpio_is_ready_dt(&button)) {
        return -1;
    }
    return gpio_pin_configure_dt(&button, GPIO_INPUT);
}

int app_button_read(void)
{
    return gpio_pin_get_dt(&button);
}
