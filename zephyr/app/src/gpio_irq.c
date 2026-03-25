#include "gpio_irq.h"
#include "uart_comm.h"
#include <zephyr/kernel.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/sys/printk.h>

#define IRQ_GPIO_PORT DT_NODELABEL(gpiob)
#define IRQ_GPIO_PIN  5

static struct gpio_callback gpio_irq_cb;
static const struct device *irq_gpio_dev = NULL;

static void gpio_irq_callback(const struct device *dev, struct gpio_callback *cb, uint32_t pins)
{
    ARG_UNUSED(dev);
    ARG_UNUSED(cb);
    printk("[PB5 IRQ] Interrupt triggered on pins: 0x%x\n", pins);
    if (app_uart_send("TOGGLE_1\n", 9) < 0) {
        printk("[PB5 IRQ] ERROR: UART not ready - cannot send\n");
    } else {
        printk("[PB5 IRQ] Sending TOGGLE_1 command\n");
    }
}

int app_gpio_irq_init(void)
{
    irq_gpio_dev = DEVICE_DT_GET(IRQ_GPIO_PORT);
    if (irq_gpio_dev == NULL || !device_is_ready(irq_gpio_dev)) {
        printk("IRQ GPIO device (GPIOB) not ready\n");
        return -1;
    }

    gpio_pin_configure(irq_gpio_dev, IRQ_GPIO_PIN, GPIO_INPUT | GPIO_PULL_DOWN);
    gpio_init_callback(&gpio_irq_cb, gpio_irq_callback, BIT(IRQ_GPIO_PIN));
    gpio_add_callback(irq_gpio_dev, &gpio_irq_cb);
    gpio_pin_interrupt_configure(irq_gpio_dev, IRQ_GPIO_PIN, GPIO_INT_EDGE_TO_ACTIVE);

    printk("GPIO IRQ initialized on PB%d\n", IRQ_GPIO_PIN);
    return 0;
}
