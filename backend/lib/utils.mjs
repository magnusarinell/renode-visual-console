import { state } from "../state.mjs";
import { DEFAULT_MACHINE } from "../config.mjs";

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function resolveMachine(machine) {
  if (!machine) return state.activeMachines[0] || DEFAULT_MACHINE;
  return machine;
}
