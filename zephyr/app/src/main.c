#include <zephyr/kernel.h>
#include <zephyr/sys/printk.h>
#include <string.h>
#include <stdbool.h>

#include "adc.h"
#include "outputs.h"
#include "uart_comm.h"
#include "gpio_irq.h"

static uint32_t tick = 0;
static uint32_t step = 0;
static bool     led0_state = false;
static bool     button_pressed_prev = false;
static char     uart_cmd_buf[64];
static size_t   uart_cmd_len = 0;

int main(void)
{
    /* Small delay to allow UART backend/tester to connect before printing init messages */
    k_msleep(2000);
    printk("Zephyr C Application Started\n");

    if (app_led_init() != 0) {
        printk("LED init failed\n");
    }

    int output_count = app_outputs_init();
    printk("Outputs initialized: %d\n", output_count);

    if (app_button_init() != 0) {
        printk("Button init failed\n");
    }

    if (app_uart_init() != 0) {
        printk("UART init failed - inter-board communication unavailable\n");
    }

    app_gpio_irq_init();
    app_adc_init();

    printk("Application ready, entering main loop\n");

    while (1) {
        bool button_pressed = app_button_read() != 0;
        bool rising_edge    = button_pressed && !button_pressed_prev;
        button_pressed_prev = button_pressed;

        /* B1 press: send TOGGLE_1 to the other board via inter-board UART */
        if (rising_edge) {
            if (app_uart_send("TOGGLE_1\n", 9) >= 0) {
                printk("[B1] Sending TOGGLE_1\n");
            }
        }

        tick++;

        /* Rotating chase: one bit cycling through led1/led2/led3 (outputs[1..3]) */
        uint32_t ticks_per_step = (blink_interval_ms / 240) + 1;
        if (tick % ticks_per_step == 0) {
            write_pattern(1u << (step % 3));
            step++;
        }

        /* Process incoming UART messages */
        uint8_t rxbuf[128];
        int rxlen = app_uart_recv(rxbuf, sizeof(rxbuf));
        for (int i = 0; i < rxlen; i++) {
            char ch = (char)rxbuf[i];
            if (ch == '\r' || ch == '\n') {
                uart_cmd_buf[uart_cmd_len] = '\0';
                if (uart_cmd_len > 0 && strcmp(uart_cmd_buf, "TOGGLE_1") == 0) {
                    led0_state = !led0_state;
                    app_output_write(0, led0_state ? 1 : 0);
                    printk("TOGGLE_1 received - led0 %s\n", led0_state ? "ON" : "OFF");
                }
                uart_cmd_len = 0;
                continue;
            }
            if (uart_cmd_len < sizeof(uart_cmd_buf) - 1) {
                uart_cmd_buf[uart_cmd_len++] = ch;
            } else {
                uart_cmd_len = 0;
            }
        }

        k_msleep(120);
    }

    return 0;
}
