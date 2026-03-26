import path from "node:path";
import os from "node:os";
import { readFileSync, existsSync } from "node:fs";
import { state } from "../state.mjs";
import { emit, emitLog } from "./broadcast.mjs";
import { executeRenodeCommandSilent } from "./rpc.mjs";
import { resolveAddr2line, getElfPathForScenario, getBlinkIntervalMsAddr } from "./elfs.mjs";

export const OLED_FRAME_PATH = path.join(os.tmpdir(), "renode_oled_frame.bin");

async function pollOledFrame() {
  if (!state.renodeReady || !state.renodeRunning || state.activeScenario !== "daisy") return;
  const machine = state.activeMachines[0];
  if (!machine) return;
  try {
    if (!existsSync(OLED_FRAME_PATH)) return;
    const buf = readFileSync(OLED_FRAME_PATH);
    if (buf.length < 1024) return;
    const raw = buf.slice(0, 1024).toString("base64");
    emit({ type: "oled_frame", machine, data: raw, ts: Date.now() });
  } catch { /* ignore transient errors */ }
}

export function startOledPollLoop() {
  if (state._oledPollTimer || state.activeScenario !== "daisy") return;
  state._oledPollTimer = setInterval(() => pollOledFrame().catch(() => {}), 300);
}

export function stopOledPollLoop() {
  if (state._oledPollTimer) {
    clearInterval(state._oledPollTimer);
    state._oledPollTimer = null;
  }
}

async function pollPcValue() {
  const supported =
    state.activeScenario === "daisy" ||
    state.activeScenario === "discovery";
  if (!state.renodeReady || !state.renodeRunning || !supported) return;
  const machines = state.activeScenario === "discovery" ? state.activeMachines : [state.activeMachines[0]];
  const elfPath = getElfPathForScenario();
  for (const machine of machines) {
    if (!machine) continue;
    try {
      const result = await executeRenodeCommandSilent("cpu PC", machine);
      const raw = (result.return || result.output || "").trim();
      const m = raw.match(/0x[0-9a-fA-F]+/);
      if (!m) continue;
      const pc = m[0];
      const src = await resolveAddr2line(pc, elfPath);
      emit({ type: "pc_value", machine, pc, ...(src || {}), ts: Date.now() });
    } catch { /* ignore */ }
  }
}

export function startPcPollLoop() {
  const supported =
    state.activeScenario === "daisy" ||
    state.activeScenario === "discovery";
  if (state._pcPollTimer || !supported) return;
  state._pcPollTimer = setInterval(() => pollPcValue().catch(() => {}), 750);
}

export function stopPcPollLoop() {
  if (state._pcPollTimer) {
    clearInterval(state._pcPollTimer);
    state._pcPollTimer = null;
  }
}

// ── ADC readback poll (discovery / nucleo scenario) ─────────────────────────
// Reads blink_interval_ms from simulated RAM and converts back to voltage.
// This gives the UI a genuine Renode-sourced voltage reading.

async function pollAdcReadback() {
  if (!state.renodeReady || !state.renodeRunning || state.activeScenario !== "discovery") return;
  const addr = getBlinkIntervalMsAddr();
  if (addr === null) return;

  for (const machine of state.activeMachines) {
    if (!machine) continue;
    try {
      const result = await executeRenodeCommandSilent(
        `sysbus ReadDoubleWord 0x${addr.toString(16)}`,
        machine
      );
      const raw = (result.return || result.output || "").trim();
      // ReadDoubleWord returns hex (e.g. "0x7D0") — use Number() to handle both hex and decimal
      const m = raw.match(/(0x[0-9a-fA-F]+|\d+)/);
      if (!m) continue;
      const blinkMs = Number(m[1]);
      // Reverse the mapping: blinkMs = 300 - (v/3.3)*290  →  v = (300-blinkMs)/290*3.3
      const voltage = Math.max(0, Math.min(3.3, ((300 - blinkMs) / 290) * 3.3));
      emit({ type: "adc_readback", machine, pin: "PA0", voltage, blinkMs, ts: Date.now() });
    } catch { /* ignore transient errors */ }
  }
}

export function startAdcReadbackPollLoop() {
  if (state._adcReadbackPollTimer || state.activeScenario !== "discovery") return;
  state._adcReadbackPollTimer = setInterval(() => pollAdcReadback().catch(() => {}), 800);
}

export function stopAdcReadbackPollLoop() {
  if (state._adcReadbackPollTimer) {
    clearInterval(state._adcReadbackPollTimer);
    state._adcReadbackPollTimer = null;
  }
}
