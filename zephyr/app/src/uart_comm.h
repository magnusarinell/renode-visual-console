#pragma once
#include <stdint.h>
#include <stddef.h>

int app_uart_init(void);
int app_uart_send(const char *buf, size_t len);
int app_uart_recv(uint8_t *buf, size_t len);
