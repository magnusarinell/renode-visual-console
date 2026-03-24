import path from "node:path";
import os from "node:os";
import { readFileSync, existsSync } from "node:fs";
import { state } from "../state.mjs";
import { emit, emitLog } from "./broadcast.mjs";
import { executeRenodeCommandSilent } from "./rpc.mjs";
import { resolveAddr2line, getElfPathForScenario } from "./elfs.mjs";

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
    state.activeScenario === "esp32c3" ||
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
      const src = state.activeScenario !== "esp32c3" ? await resolveAddr2line(pc, elfPath) : null;
      emit({ type: "pc_value", machine, pc, ...(src || {}), ts: Date.now() });
    } catch { /* ignore */ }
  }
}

export function startPcPollLoop() {
  const supported =
    state.activeScenario === "daisy" ||
    state.activeScenario === "esp32c3" ||
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
