#include "outputs.h"
#include <zephyr/kernel.h>
#include <zephyr/device.h>
#include <zephyr/drivers/gpio.h>

static const struct gpio_dt_spec led  = GPIO_DT_SPEC_GET(DT_ALIAS(led0), gpios);
static const struct gpio_dt_spec led1 = GPIO_DT_SPEC_GET_OR(DT_ALIAS(led1), gpios, {0});
static const struct gpio_dt_spec led2 = GPIO_DT_SPEC_GET_OR(DT_ALIAS(led2), gpios, {0});
static const struct gpio_dt_spec led3 = GPIO_DT_SPEC_GET_OR(DT_ALIAS(led3), gpios, {0});

static const struct gpio_dt_spec button = GPIO_DT_SPEC_GET(DT_ALIAS(sw0), gpios);

/* Mode indicator LEDs: PB12=Blink, PB13=Chase, PB14=Showcase */
static const struct gpio_dt_spec mode_led0 = GPIO_DT_SPEC_GET(DT_ALIAS(mode_led0), gpios);
static const struct gpio_dt_spec mode_led1 = GPIO_DT_SPEC_GET(DT_ALIAS(mode_led1), gpios);
static const struct gpio_dt_spec mode_led2 = GPIO_DT_SPEC_GET(DT_ALIAS(mode_led2), gpios);

static const struct gpio_dt_spec *const outputs[] = {
    &led,
    &led1,
    &led2,
    &led3,
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
    /* outputs[0] = led0/PD12 reserved for TOGGLE_1; only drive led1..3 */
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

/* ── Mode LEDs ── */

int app_mode_leds_init(void)
{
    if (gpio_pin_configure_dt(&mode_led0, GPIO_OUTPUT_INACTIVE) != 0) return -1;
    if (gpio_pin_configure_dt(&mode_led1, GPIO_OUTPUT_INACTIVE) != 0) return -1;
    if (gpio_pin_configure_dt(&mode_led2, GPIO_OUTPUT_INACTIVE) != 0) return -1;
    return 0;
}

void update_mode_leds(uint8_t m)
{
    gpio_pin_set_dt(&mode_led0, 1);
    gpio_pin_set_dt(&mode_led1, m >= 1 ? 1 : 0);
    gpio_pin_set_dt(&mode_led2, m >= 2 ? 1 : 0);
}
