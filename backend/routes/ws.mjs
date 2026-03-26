import { state } from "../state.mjs";
import { AUTO_START_RENODE } from "../config.mjs";
import { emit, emitLog } from "../lib/broadcast.mjs";
import { executeRenodeCommand, executeRenodeCommandSilent } from "../lib/rpc.mjs";
import { handleGpioPulse, handleGpioRequest, handleGpioScanRequest } from "../lib/gpio.mjs";
import { handleLoadScript, handleClear, setDaisyElfVariable } from "../lib/scenarios.mjs";
import { startRenode, stopRenode, sendMonitorCommand } from "../lib/renode.mjs";
import { scanDaisyElfs, scanDiscoveryElfs, getDaisyAdcDmaBufAddr, getBlinkIntervalMsAddr } from "../lib/elfs.mjs";
import { resolveMachine } from "../lib/utils.mjs";

export default async function wsRoutes(fastify) {
  fastify.get("/", { websocket: true }, (socket, _req) => {
    // Send current state and replay log buffer before joining broadcast
    socket.send(JSON.stringify({
      type: "hello",
      running: state.renodeRunning,
      scenario: state.activeScenario,
      elf_list: scanDaisyElfs(),
      discovery_elf_list: scanDiscoveryElfs(),
      ts: Date.now(),
    }));
    for (const entry of state.logBuffer) {
      if (socket.readyState === 1) socket.send(JSON.stringify(entry));
    }

    state.clients.add(socket);
    emitLog("system", "WebSocket client connected");

    if (AUTO_START_RENODE && !state.renodeRunning) {
      startRenode();
    }

    socket.on("message", (raw) => {
      try {
        const msg = JSON.parse(String(raw));

        if (msg.type === "start") {
          startRenode();
          return;
        }

        if (msg.type === "stop") {
          stopRenode();
          return;
        }

        if (msg.type === "action") {
          const machine = resolveMachine(msg.machine);
          if (msg.action === "toggle_button") {
            // Simulate B1 press (PC13 active LOW): pull LOW, wait 80 ms wall-clock so
            // simulation time can advance enough for the firmware loop to observe the
            // LOW state, then release.
            executeRenodeCommandSilent("sysbus.gpioPortC OnGPIO 13 false", machine)
              .then(() => new Promise((r) => setTimeout(r, 80)))
              .then(() => executeRenodeCommandSilent("sysbus.gpioPortC OnGPIO 13 true", machine))
              .catch(() => {});
            return;
          }
          if (msg.action === "press_button") {
            sendMonitorCommand("sysbus.gpioPortC OnGPIO 13 false", machine);
            return;
          }
          if (msg.action === "release_button") {
            sendMonitorCommand("sysbus.gpioPortC OnGPIO 13 true", machine);
            return;
          }
        }

        if (msg.type === "load_script" && typeof msg.scenario === "string") {
          if (typeof msg.elf === "string" && msg.elf) {
            if (msg.scenario === "daisy") state._daisyElfOverride = msg.elf;

          }
          handleLoadScript(msg.scenario).catch((err) =>
            emitLog("system", `Load script error: ${err.message}`)
          );
          return;
        }

        if (msg.type === "select_binary" && typeof msg.elf === "string") {
          const scenario =
            msg.scenario === "discovery" ? "discovery" :
            "daisy";
          if (scenario === "discovery") state._discoveryElfOverride = msg.elf;
          else state._daisyElfOverride = msg.elf;
          handleLoadScript(scenario).catch((err) =>
            emitLog("system", `select_binary error: ${err.message}`)
          );
          return;
        }

        if (msg.type === "clear") {
          handleClear().catch((err) =>
            emitLog("system", `Clear error: ${err.message}`)
          );
          return;
        }

        if (msg.type === "command" && typeof msg.command === "string") {
          sendMonitorCommand(msg.command, resolveMachine(msg.machine));
          return;
        }

        if (msg.type === "analog" && typeof msg.pin === "string" && typeof msg.voltage === "number") {
          const machine = resolveMachine(msg.machine);
          const v = Math.max(0, Math.min(3.3, msg.voltage)).toFixed(3);

          if (machine === "daisy_0") {
            const DAISY_ADC_PINS = new Set(["PC4"]);
            if (!DAISY_ADC_PINS.has(msg.pin)) {
              emitLog("system", `No ADC mapping for pin ${msg.pin} (daisy)`, machine);
              return;
            }
            getDaisyAdcDmaBufAddr(machine).then((bufAddr) => {
              if (bufAddr === null) {
                emitLog("system", "ADC DMA buffer not yet resolved — firmware may still be initialising", machine);
                return;
              }
              const raw16 = Math.max(0, Math.min(65535, Math.round((parseFloat(v) / 3.3) * 65535)));
              const cmd = `sysbus WriteWord 0x${bufAddr.toString(16)} ${raw16}`;
              executeRenodeCommand(cmd, machine)
                .then(() => emitLog("system", `ADC ${msg.pin}: ${v}V → dma_buf[0]=${raw16} (${(parseFloat(v) / 3.3 * 100).toFixed(0)}%)`, machine))
                .catch(() => {});
            }).catch(() => {});
            return;
          }

          const PIN_TO_ADC_CH = { PA0: 0, PA1: 1 };
          const ch = PIN_TO_ADC_CH[msg.pin];
          if (ch !== undefined) {
            executeRenodeCommandSilent(`sysbus.adc1 SetVoltage ${ch} ${v}`, machine).catch(() => {});
            const blinkMs = Math.max(10, Math.round(300 - (parseFloat(v) / 3.3) * 290));
            const addr = getBlinkIntervalMsAddr();
            if (addr !== null) {
              const cmd = `sysbus WriteDoubleWord 0x${addr.toString(16)} ${blinkMs}`;
              emitLog("command", `${cmd}\n`, machine);
              executeRenodeCommandSilent(cmd, machine)
                .then(() => emitLog("system", `ADC ${msg.pin} ch${ch}: ${v}V → blink ${blinkMs}ms`, machine))
                .catch((err) => emitLog("system", `ADC write error: ${err.message}`));
            } else {
              emitLog("system", `ADC ${msg.pin} ch${ch} set to ${v}V (${machine}) [no map addr]`);
            }
          } else {
            emitLog("system", `No ADC channel mapping for pin ${msg.pin}`);
          }
          return;
        }

        if (msg.type === "gpio" && msg.op === "pulse") {
          handleGpioPulse(msg).catch((err) => emitLog("system", `GPIO pulse error: ${err.message}`));
          return;
        }

        if (msg.type === "gpio" && (msg.op === "read" || msg.op === "write")) {
          handleGpioRequest(msg).catch((err) => emitLog("system", `GPIO request error: ${err.message}`));
          return;
        }

        if (msg.type === "gpio" && msg.op === "scan") {
          handleGpioScanRequest(msg).catch((err) => emitLog("system", `GPIO scan error: ${err.message}`));
          return;
        }
      } catch (err) {
        emitLog("system", `Bad message: ${err.message}`);
      }
    });

    socket.on("close", () => {
      state.clients.delete(socket);
    });
  });
}
