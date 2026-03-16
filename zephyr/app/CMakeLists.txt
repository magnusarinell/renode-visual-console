cmake_minimum_required(VERSION 3.13.1)
find_package(Zephyr REQUIRED HINTS $ENV{ZEPHYR_BASE})
project(app)

# Pure C application - no Rust
target_sources(app PRIVATE
  src/main.c
  src/adc.c
  src/outputs.c
  src/uart_comm.c
  src/gpio_irq.c
)
