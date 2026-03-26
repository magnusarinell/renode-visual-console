#include "adc.h"
#include <zephyr/kernel.h>
#include <zephyr/sys/printk.h>

volatile uint32_t blink_interval_ms = 150;

#define ADC_THREAD_STACK_SIZE 512
#define ADC_THREAD_PRIORITY   5

static K_THREAD_STACK_DEFINE(adc_thread_stack, ADC_THREAD_STACK_SIZE);
static struct k_thread adc_thread_data;

static void adc_thread_fn(void *arg1, void *arg2, void *arg3)
{
    ARG_UNUSED(arg1); ARG_UNUSED(arg2); ARG_UNUSED(arg3);
    uint32_t prev_blink = UINT32_MAX; /* force print on first iteration */
    while (1) {
        uint32_t current = blink_interval_ms;
        if (current != prev_blink) {
            printk("ADC: blink=%dms\n", current);
            prev_blink = current;
        }
        k_msleep(200);
    }
}

int app_adc_init(void)
{
    k_thread_create(&adc_thread_data, adc_thread_stack,
                    K_THREAD_STACK_SIZEOF(adc_thread_stack),
                    adc_thread_fn, NULL, NULL, NULL,
                    ADC_THREAD_PRIORITY, 0, K_MSEC(500));
    k_thread_name_set(&adc_thread_data, "adc_reader");
    return 0;
}
