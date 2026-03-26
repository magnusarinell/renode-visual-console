import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const thisFile = fileURLToPath(import.meta.url);
export const repoRoot = path.resolve(path.dirname(thisFile), "..");

export const PORT = Number(process.env.RENODE_BRIDGE_PORT || 8787);
export const AUTO_START_RENODE = process.env.AUTO_START_RENODE !== "false";
export const RENODE_MODE =
  process.env.RENODE_MODE ||
  (process.env.RENODE_ROBOT_PORT ? "robot" : process.env.RENODE_MONITOR_PORT ? "external" : "spawn");
export const RENODE_MONITOR_HOST = process.env.RENODE_MONITOR_HOST || "127.0.0.1";
export const RENODE_MONITOR_PORT = process.env.RENODE_MONITOR_PORT
  ? Number(process.env.RENODE_MONITOR_PORT)
  : null;
export const RENODE_ROBOT_HOST = process.env.RENODE_ROBOT_HOST || "localhost";
export const RENODE_ROBOT_PORT = process.env.RENODE_ROBOT_PORT
  ? Number(process.env.RENODE_ROBOT_PORT)
  : 55555;
export const RENODE_UART = process.env.RENODE_UART || "sysbus.usart3";
export const MACHINES = (process.env.RENODE_MACHINES || "board_0,board_1")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
export const DEFAULT_MACHINE = MACHINES[0] || "board_0";
export const DAISY_ELF = process.env.DAISY_ELF || "";
export const renodeCmd = process.env.RENODE_CMD || "renode";
export const LOG_BUFFER_MAX = 5000;

// TCP ports for Renode ServerSocketTerminal (one per discovery board).
// Matches the ports in renode/discovery/discovery_dual.resc.
export const UART_SOCKET_PORT_BASE = Number(process.env.UART_SOCKET_PORT_BASE || 12345);

export const simScript = process.env.RENODE_SCRIPT
  ? path.resolve(repoRoot, process.env.RENODE_SCRIPT)
  : "";
export const simScriptPosix = simScript.replace(/\\/g, "/");

const _isDaisyScript   = simScript.includes("daisy");
const _isEsp32c3Script = simScript.includes("esp32c3");
const _hasScript       = Boolean(simScript);

export const INITIAL_MACHINES = _hasScript
  ? (_isDaisyScript ? ["daisy_0"] : (_isEsp32c3Script ? ["esp32c3_0"] : [...MACHINES]))
  : [];
export const INITIAL_UART_PERIPHERAL = _hasScript
  ? (_isDaisyScript ? "sysbus.usart1" : (_isEsp32c3Script ? "sysbus.uart0" : (RENODE_UART || "sysbus.usart3")))
  : "";
export const INITIAL_HUB_PERIPHERAL = null;
export const INITIAL_SCENARIO = _hasScript
  ? (_isDaisyScript ? "daisy" : (_isEsp32c3Script ? "esp32c3" : "discovery"))
  : "none";

function resolveWrapperTool(toolName) {
  const wrapperPath = path.join(repoRoot, ".toolchain-wrappers", `arm-none-eabi-${toolName}.exe`);
  try {
    const content = readFileSync(wrapperPath, "utf8");
    const m = content.match(/exec\s+"([^"]+)"/);
    if (m) return m[1];
  } catch { /* wrapper not present */ }
  return null;
}
export const ADDR2LINE_BIN = resolveWrapperTool("addr2line");
