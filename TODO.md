# TODO

## Nucleo-buggar (backlog)
* [nucleo] Ta bort LED-holes (PB12/13/14) från breadboard-panelen – de syns redan på board-SVG:en
* [nucleo] Breadboard/pot-panel skall använda Daisys `bb-` CSS-stil istället för `nbb-`
* [nucleo] TOGGLE-fix: B1-tryck → skicka TOGGLE_1 via UART → HUB echoar tillbaka → BÅDA korten reagerar. Firmware måste ignorera eget echo (flag `uart_ignore_toggle_echo`). Se `zephyr/app/src/main.c`.
* [nucleo] GPIO-polling är 50 ms (poll per port × 2 kort = trög LED-uppdatering). Proper fix: Renode Python GPIO-hooks → TCP push → backend. Kortsiktig fix: reducera scannade pins till bara PA5+PB12+PB13+PB14.
* [nucleo] COM-panelen: USART1-knapp ser grå ut, etiketterna "USART1"/"USART2" förklarar inte innehållet. Byt till "HUB" (inter-board) / "DEBUG" (printk), lägg till aktiv-färg för HUB-knappen och stäng av HUB som default.

* Add Robot Framework tests for firmware behavior (LED modes, UART commands)
* MCP
* Show main indicator if PC is around main in memory
* Kör debugging med GDB. Show in web GUI rows executing or somehting. Document debugging
* Delte zehpyr for daisy? Or make it show in firmware selector
* Microchip polarfire and Yocto
* MicroPython-variant for nucleo
* Monitor tab not showing anything really. Remove and set debug there? Debug show as oneline, with expander? Under each board?