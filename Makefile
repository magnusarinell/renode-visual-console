.PHONY: help build-nucleo build clean rebuild renode run

help:
	@echo "Available targets:"
	@echo "  make build-nucleo - Build firmware for STM32F411RE-Nucleo (Renode target)"
	@echo "  make build        - Build all firmware (nucleo + daisy + espidf)"
	@echo "  make clean        - Remove Zephyr build directory"
	@echo "  make rebuild      - Clean then build nucleo"
	@echo "  make renode       - Build and start Renode simulation"
	@echo "  make run          - Alias for make renode"

build-nucleo:
	@bash scripts/build_nucleo.sh

build:
	@bash scripts/build.sh

clean:
	@bash scripts/clean.sh

rebuild:
	@bash scripts/rebuild.sh

renode:
	@bash scripts/run_renode.sh

run: renode
