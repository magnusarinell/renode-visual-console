#include "uart_comm.h"
#include <zephyr/kernel.h>
#include <zephyr/drivers/uart.h>
#include <zephyr/sys/ring_buffer.h>
#include <zephyr/sys/printk.h>

#define UART_RX_RING_BUF_SIZE 512
RING_BUF_DECLARE(uart_rx_ring_buf, UART_RX_RING_BUF_SIZE);

static const struct device *uart_inter_board = NULL;

static void uart_irq_handler(const struct device *dev, void *user_data)
{
    ARG_UNUSED(user_data);
    while (uart_irq_update(dev) && uart_irq_rx_ready(dev)) {
        uint8_t byte;
        int ret = uart_fifo_read(dev, &byte, 1);
        if (ret > 0) {
            ring_buf_put(&uart_rx_ring_buf, &byte, 1);
        }
    }
}

int app_uart_init(void)
{
    printk("Attempting to get USART2 device...\n");
    uart_inter_board = DEVICE_DT_GET(DT_NODELABEL(usart2));

    if (uart_inter_board == NULL) {
        printk("ERROR: USART2 device NULL (DT node not found)\n");
        return -1;
    }
    if (!device_is_ready(uart_inter_board)) {
        printk("ERROR: USART2 device not ready\n");
        uart_inter_board = NULL;
        return -1;
    }

    uart_irq_callback_set(uart_inter_board, uart_irq_handler);
    uart_irq_rx_enable(uart_inter_board);

    printk("SUCCESS: Inter-board UART initialized (USART2 @ 115200, IRQ RX)\n");
    return 0;
}

int app_uart_send(const char *buf, size_t len)
{
    if (uart_inter_board == NULL) return -1;
    for (size_t i = 0; i < len; i++) {
        uart_poll_out(uart_inter_board, buf[i]);
    }
    return (int)len;
}

int app_uart_recv(uint8_t *buf, size_t len)
{
    if (uart_inter_board == NULL) return -1;
    return (int)ring_buf_get(&uart_rx_ring_buf, buf, (uint32_t)len);
}
