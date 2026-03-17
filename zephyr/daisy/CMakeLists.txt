cmake_minimum_required(VERSION 3.13.1)
find_package(Zephyr REQUIRED HINTS $ENV{ZEPHYR_BASE})
project(daisy_seed_demo)

target_sources(app PRIVATE src/main.c)
