import { state } from "../state.mjs";
import { emitLog, emit } from "./broadcast.mjs";
import { callXmlRpc, executeRenodeCommandSilent, executeRenodeCommandSilentGpio } from "./rpc.mjs";
import { resolveMachine } from "./utils.mjs";

export const DAISY_PIN_LABELS = {
  PA0: "D25·A10", PA1: "D24·A9",  PA2: "D28·A11 Pin35", PA3: "D16·A1",
  PA4: "D23·A8",  PA5: "D22·A7",  PA6: "D19·A4",        PA7: "D18·A3",  PA15: "Zephyr led0",
  PB1: "D17·A2",  PB4: "D9",      PB5: "D10",           PB6: "D13",     PB7: "D14",
  PB8: "D11",     PB9: "D12",     PB12: "D0",           PB14: "D29",    PB15: "D30",
  PC0: "D15·A0",  PC1: "D20·A5",  PC4: "D21·A6",        PC7: "LED",
  PC8: "D4",      PC9: "D3",      PC10: "D2",           PC11: "D1",     PC12: "D6",
  PD2: "D5",      PD11: "D26",    PG9: "D27",           PG10: "D7",     PG11: "D8",
};

export const GPIO_PUSH_PORTS_DISCOVERY = {
  A: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  B: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  C: [13], // PC13 = B1 user button
};

export const GPIO_PUSH_PORTS_DAISY = {
  A: [0, 1, 2, 3, 4, 5, 6, 7, 15],
  B: [1, 4, 5, 6, 7, 8, 9, 12, 14, 15],
  C: [0, 1, 4, 7, 8, 9, 10, 11, 12],
};

export const GPIO_PUSH_PINS_ESP32C3 = [5];

export function parsePinLabel(pinLabel) {
  const m = String(pinLabel || "").match(/^P([A-Z])(\d+)$/);
  if (!m) return null;
  return { port: m[1], pin: Number(m[2]) };
}

export function parseGpioList(text) {
  const map = new Map();
  const regex = /\((\d+),\s*GPIO:\s*(set|unset)\)/gi;
  let m = regex.exec(text);
  while (m) {
    map.set(Number(m[1]), m[2].toLowerCase() === "set");
    m = regex.exec(text);
  }
  return map;
}

export function formatGpioPin(pin) {
  if (state.activeScenario !== "daisy") return pin;
  const lbl = DAISY_PIN_LABELS[pin];
  return lbl ? `${lbl} → STM32 GPIO ${pin}` : `GPIO ${pin}`;
}

export function formatGpioLogEntry(pin, levelStr, machine) {
  if (state.activeScenario === "daisy") {
    const lbl = DAISY_PIN_LABELS[pin];
    if (lbl) return `${lbl} → STM32 GPIO ${pin} → ${levelStr}`;
  }
  return `GPIO ${pin} → ${levelStr} (${machine})`;
}

export function getGpioPushPorts() {
  return state.activeScenario === "daisy" ? GPIO_PUSH_PORTS_DAISY : GPIO_PUSH_PORTS_DISCOVERY;
}

export async function handleGpioPulse(msg) {
  if (!state.renodeReady) return;
  const parsed = parsePinLabel(msg.pin);
  if (!parsed) return;
  const machine = resolveMachine(msg.machine);
  if (!state.activeMachines.includes(machine)) return;
  const portName = `sysbus.gpioPort${parsed.port}`;

  await executeRenodeCommandSilent(`${portName} OnGPIO ${parsed.pin} false`, machine);
  if (!state.activeMachines.includes(machine)) return;
  emitLog("system", `GPIO ${formatGpioPin(msg.pin)} \u2192 LOW (pulse, ${machine})`, machine);

  if (state.uartTesterReadyByMachine.get(machine)) {
    const testerId = state.uartTesterIdByMachine.get(machine);
    await (testerId
      ? callXmlRpc("WaitForNextLineOnUart", [`timeout=0.1`, `testerId=${testerId}`])
      : callXmlRpc("WaitForNextLineOnUart", [`timeout=0.1`])
    ).catch(() => {});
  }

  if (!state.activeMachines.includes(machine)) return;
  await executeRenodeCommandSilent(`${portName} OnGPIO ${parsed.pin} true`, machine);
  if (!state.activeMachines.includes(machine)) return;
  emitLog("system", `GPIO ${formatGpioPin(msg.pin)} \u2192 HIGH (pulse release, ${machine})`, machine);

  const readResult = await executeRenodeCommandSilent(`${portName} GetGPIOs`, machine);
  if (readResult.status === "PASS" && state.activeMachines.includes(machine)) {
    const gpioMap = parseGpioList(readResult.return || readResult.output || "");
    const level = gpioMap.has(parsed.pin) ? gpioMap.get(parsed.pin) : null;
    emit({ type: "pin_state", machine, pin: msg.pin, level, ts: Date.now() });
  }
}

export async function handleGpioRequest(msg) {
  if (!state.renodeReady) {
    if (!state.renodeLoading) emitLog("system", "Renode is not running or not ready yet. Start simulator first.");
    return;
  }

  const parsed = parsePinLabel(msg.pin);
  if (!parsed) {
    emitLog("system", `Invalid pin label: ${msg.pin}`);
    return;
  }

  const machine = resolveMachine(msg.machine);
  if (!state.activeMachines.includes(machine)) return;
  const portName = `sysbus.gpioPort${parsed.port}`;

  if (msg.op === "write") {
    const level = Boolean(msg.level);
    const cmd = `${portName} OnGPIO ${parsed.pin} ${level ? "true" : "false"}`;
    emitLog("command", `${cmd}\n`, machine);
    emitLog("system", formatGpioLogEntry(msg.pin, level ? "HIGH" : "LOW", machine), machine);
    const writeResult = await executeRenodeCommandSilent(cmd, machine);
    if (writeResult.status === "FAIL") {
      if (state.activeMachines.includes(machine)) {
        emitLog("system", `GPIO write failed for ${msg.pin}: ${writeResult.error}`);
      }
      return;
    }
    state.gpioWriteOverrides[`${machine}:${msg.pin}`] = level;
    state._gpioPrevState[`${machine}:P${parsed.port}${parsed.pin}`] = level;
    emit({ type: "pin_state", machine, pin: msg.pin, level, ts: Date.now() });
    if (!state.activeMachines.includes(machine)) return;
    const writeTid = state.uartTesterIdByMachine.get(machine);
    if (state.uartTesterReadyByMachine.get(machine)) {
      await (writeTid
        ? callXmlRpc("WaitForNextLineOnUart", [`timeout=0.1`, `testerId=${writeTid}`])
        : callXmlRpc("WaitForNextLineOnUart", [`timeout=0.1`])
      ).catch(() => {});
    }
    return;
  }

  const readResult = await executeRenodeCommandSilent(`${portName} GetGPIOs`, machine);
  if (readResult.status === "FAIL") {
    if (state.activeMachines.includes(machine)) {
      emitLog("system", `GPIO read failed for ${msg.pin}: ${readResult.error}`);
    }
    return;
  }
  const gpioMap = parseGpioList(readResult.return || readResult.output || "");
  const level = gpioMap.has(parsed.pin) ? gpioMap.get(parsed.pin) : null;
  emit({ type: "pin_state", machine, pin: msg.pin, level, ts: Date.now() });
}

export async function handleGpioScanRequest(msg) {
  if (!state.renodeReady) return;
  const requestedPins = Array.isArray(msg.pins) ? msg.pins : [];
  const machine = resolveMachine(msg.machine);
  if (!state.activeMachines.includes(machine)) return;
  if (!requestedPins.length) return;

  const grouped = new Map();
  for (const pinLabel of requestedPins) {
    const parsed = parsePinLabel(pinLabel);
    if (!parsed) continue;
    if (!grouped.has(parsed.port)) grouped.set(parsed.port, []);
    grouped.get(parsed.port).push({ label: pinLabel, pin: parsed.pin });
  }

  for (const [port, pins] of grouped.entries()) {
    const result = await executeRenodeCommandSilent(`sysbus.gpioPort${port} GetGPIOs`, machine);
    if (result.status === "FAIL") {
      if (state.activeMachines.includes(machine) && !state.renodeLoading) {
        emitLog("system", `GPIO scan failed for port ${port}: ${result.error}`);
      }
      continue;
    }
    const gpioMap = parseGpioList(result.return || result.output || "");
    for (const item of pins) {
      const fromMap = gpioMap.has(item.pin) ? gpioMap.get(item.pin) : undefined;
      const override = state.gpioWriteOverrides[`${machine}:P${port}${item.pin}`];
      const level = fromMap !== undefined ? fromMap : (override !== undefined ? override : null);
      emit({ type: "pin_state", machine, pin: item.label, level, ts: Date.now() });
    }
  }
}

export async function pushGpioState(machine) {
  if (!state.renodeReady || !state.renodeRunning) return;

  if (state.activeScenario === "esp32c3") {
    let result;
    try {
      result = await executeRenodeCommandSilentGpio("sysbus ReadDoubleWord 0x60004004", machine);
    } catch { return; }
    if (!result || result.status === "FAIL") return;
    const raw = `${result.return || ""} ${result.output || ""}`;
    const m = raw.match(/0x([0-9a-fA-F]+)/);
    const outReg = m ? parseInt(m[1], 16) >>> 0 : 0;
    for (const pinNum of GPIO_PUSH_PINS_ESP32C3) {
      const level = Boolean(outReg & (1 << pinNum));
      const key = `${machine}:GPIO${pinNum}`;
      if (state._gpioPrevState[key] !== level) {
        state._gpioPrevState[key] = level;
        emit({ type: "pin_state", machine, pin: `GPIO${pinNum}`, level, ts: Date.now() });
      }
    }
    return;
  }

  for (const [port, pins] of Object.entries(getGpioPushPorts())) {
    let result;
    try {
      result = await executeRenodeCommandSilentGpio(`sysbus.gpioPort${port} GetGPIOs`, machine);
    } catch { return; }
    if (!result || result.status === "FAIL") continue;
    const gpioMap = parseGpioList(result.return || result.output || "");
    for (const pinNum of pins) {
      const fromMap = gpioMap.has(pinNum) ? gpioMap.get(pinNum) : undefined;
      const overrideKey = `${machine}:P${port}${pinNum}`;
      const override = state.gpioWriteOverrides[overrideKey];
      const level = override !== undefined ? override : (fromMap !== undefined ? fromMap : null);
      const alwaysEmit = state.activeScenario === "daisy" && port === "A" && pinNum === 2;
      const sampleLevel = alwaysEmit ? (fromMap !== undefined ? fromMap : null) : level;
      if (alwaysEmit || state._gpioPrevState[overrideKey] !== sampleLevel) {
        state._gpioPrevState[overrideKey] = sampleLevel;
        emit({ type: "pin_state", machine, pin: `P${port}${pinNum}`, level: sampleLevel, ts: Date.now() });
      }
    }
  }
}

export function startGpioPushLoop(machine) {
  const m = resolveMachine(machine);
  if (state.gpioScanTimers.has(m)) return;
  const id = setInterval(() => pushGpioState(m).catch(() => {}), 50);
  state.gpioScanTimers.set(m, id);
}

export function stopGpioPushLoops() {
  for (const id of state.gpioScanTimers.values()) clearInterval(id);
  state.gpioScanTimers.clear();
  state._gpioPrevState = {};
  Object.keys(state.gpioWriteOverrides).forEach((k) => delete state.gpioWriteOverrides[k]);
}
