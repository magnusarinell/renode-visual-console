.PHONY: help build-disco build clean rebuild renode run

help:
	@echo "Available targets:"
	@echo "  make build-disco  - Build firmware for STM32F4 Discovery (Renode target)"
	@echo "  make build        - Build firmware for nucleo_f446re"
	@echo "  make clean        - Remove Zephyr build directory"
	@echo "  make rebuild      - Clean then build-disco"
	@echo "  make renode       - Build and start Renode simulation"
	@echo "  make run          - Alias for make renode"

build-disco:
	@bash scripts/build_disco.sh

build:
	@bash scripts/build.sh

clean:
	@bash scripts/clean.sh

rebuild:
	@bash scripts/rebuild.sh

renode:
	@bash scripts/run_renode.sh

run: renode
