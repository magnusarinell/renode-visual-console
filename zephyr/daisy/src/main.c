#include <zephyr/kernel.h>
#include <zephyr/sys/printk.h>
#include <zephyr/drivers/gpio.h>

/* led0 = PA15 (yellow LED, GPIO_ACTIVE_HIGH) */
#define LED_NODE DT_ALIAS(led0)
/* sw0  = PB3  (user button, GPIO_ACTIVE_LOW | GPIO_PULL_UP) */
#define BTN_NODE DT_ALIAS(sw0)

static const struct gpio_dt_spec led = GPIO_DT_SPEC_GET(LED_NODE, gpios);
static const struct gpio_dt_spec btn = GPIO_DT_SPEC_GET(BTN_NODE, gpios);

int main(void)
{
    printk("Daisy Seed demo started\n");

    if (!gpio_is_ready_dt(&led)) {
        printk("LED GPIO not ready\n");
        return -1;
    }
    if (!gpio_is_ready_dt(&btn)) {
        printk("Button GPIO not ready\n");
        return -1;
    }

    gpio_pin_configure_dt(&led, GPIO_OUTPUT_INACTIVE);
    gpio_pin_configure_dt(&btn, GPIO_INPUT);

    printk("Ready - press USER button to toggle PA15\n");

    bool prev_pressed = false;
    bool led_state    = false;

    while (1) {
        /* gpio_pin_get_dt returns logical level:
         * 1 = active (button pressed) due to GPIO_ACTIVE_LOW
         * 0 = inactive (button released)
         */
        bool pressed = gpio_pin_get_dt(&btn) != 0;

        if (pressed && !prev_pressed) {
            led_state = !led_state;
            gpio_pin_set_dt(&led, led_state ? 1 : 0);
            printk("BUTTON PRESSED - OUTPUT %s\n", led_state ? "HIGH" : "LOW");
        }

        prev_pressed = pressed;
        k_msleep(50);
    }

    return 0;
}
