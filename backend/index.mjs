import { spawn } from "node:child_process";
import { readFileSync, readdirSync, existsSync, unlinkSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
import { WebSocketServer } from "ws";

const PORT = Number(process.env.RENODE_BRIDGE_PORT || 8787);
const AUTO_START_RENODE = process.env.AUTO_START_RENODE !== "false";
const RENODE_MODE = process.env.RENODE_MODE ||
  (process.env.RENODE_ROBOT_PORT ? "robot" : process.env.RENODE_MONITOR_PORT ? "external" : "spawn");
const RENODE_MONITOR_HOST = process.env.RENODE_MONITOR_HOST || "127.0.0.1";
const RENODE_MONITOR_PORT = process.env.RENODE_MONITOR_PORT
  ? Number(process.env.RENODE_MONITOR_PORT)
  : null;
const RENODE_ROBOT_HOST = process.env.RENODE_ROBOT_HOST || "localhost";
const RENODE_ROBOT_PORT = process.env.RENODE_ROBOT_PORT
  ? Number(process.env.RENODE_ROBOT_PORT)
  : 55555;
const RENODE_UART = process.env.RENODE_UART || "sysbus.usart3";
const MACHINES = (process.env.RENODE_MACHINES || "board_0,board_1")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const DEFAULT_MACHINE = MACHINES[0] || "board_0";
const thisFile = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(thisFile), "..");
const simScript = process.env.RENODE_SCRIPT
  ? path.resolve(repoRoot, process.env.RENODE_SCRIPT)
  : "";
const simScriptPosix = simScript.replace(/\\/g, "/");
const renodeCmd = process.env.RENODE_CMD || "renode";

// Optional: path to a libDaisy ELF to load instead of the default Blink example.
// Passed to Renode as $elf variable before loading the daisy_seed.resc script.
const DAISY_ELF = process.env.DAISY_ELF || "";

// Derive initial scenario from the loaded script path (simScript must be defined first)
const _isDaisyScript    = simScript.includes("daisy");
const _isEsp32c3Script  = simScript.includes("esp32c3");
const _hasScript        = Boolean(simScript);
// Mutable active scenario config (can be switched at runtime)
let activeMachines       = _hasScript
  ? (_isDaisyScript ? ["daisy_0"] : (_isEsp32c3Script ? ["esp32c3_0"] : [...MACHINES]))
  : [];
let activeUartPeripheral = _hasScript
  ? (_isDaisyScript ? "sysbus.usart1" : (_isEsp32c3Script ? "sysbus.uart0" : (RENODE_UART || "sysbus.usart3")))
  : "";
let activeHubPeripheral  = _hasScript ? ((_isDaisyScript || _isEsp32c3Script) ? null : "sysbus.usart2") : null;
let activeScenario       = _hasScript ? (_isDaisyScript ? "daisy" : (_isEsp32c3Script ? "esp32c3" : "discovery")) : "none";

let renode = null;
let renodeSocket = null;
let renodeRunning = false;
let renodeReady = false;
const uartTesterReadyByMachine = new Map();
const uartTesterIdByMachine = new Map();
const uartDrainTimers = new Map();
const hubTesterReadyByMachine = new Map();
const hubTesterIdByMachine = new Map();
const hubDrainTimers = new Map();
let renodeConnecting = false;
let renodeLoading    = false; // true while a scenario is being hot-switched
let _renodeRetryTimer = null;
let rpcQueue = Promise.resolve();

// ─── Daisy ELF discovery ─────────────────────────────────────────────────────
function scanDaisyElfs() {
  const seedDir = path.join(repoRoot, "submodules", "DaisyExamples", "seed");
  if (!existsSync(seedDir)) return [];
  try {
    return readdirSync(seedDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .flatMap((d) => {
        const buildDir = path.join(seedDir, d.name, "build");
        if (!existsSync(buildDir)) return [];
        return readdirSync(buildDir)
          .filter((f) => f.endsWith(".elf"))
          .map((f) => `submodules/DaisyExamples/seed/${d.name}/build/${f}`);
      });
  } catch {
    return [];
  }
}

function scanDiscoveryElfs() {
  const buildDir = path.join(repoRoot, "zephyr", "build", "zephyr");
  if (!existsSync(buildDir)) return [];
  try {
    return readdirSync(buildDir)
      .filter((f) => f === "zephyr.elf")
      .map((f) => `zephyr/build/zephyr/${f}`);
  } catch {
    return [];
  }
}

function scanEsp32c3Elfs() {
  const elfRel = "submodules/esp-idf/examples/get-started/hello_world/build/hello_world.elf";
  const elfAbs = path.join(repoRoot, elfRel);
  return existsSync(elfAbs) ? [elfRel] : [];
}

// ─── OLED framebuffer poll loop (Daisy scenario only) ────────────────────────
let _oledPollTimer = null;
const OLED_FRAME_PATH = path.join(os.tmpdir(), "renode_oled_frame.bin");

async function pollOledFrame() {
  if (!renodeReady || !renodeRunning || activeScenario !== "daisy") return;
  const machine = activeMachines[0];
  if (!machine) return;
  try {
    if (!existsSync(OLED_FRAME_PATH)) return;
    const buf = readFileSync(OLED_FRAME_PATH);
    if (buf.length < 1024) return;
    const raw = buf.slice(0, 1024).toString("base64");
    emit({ type: "oled_frame", machine, data: raw, ts: Date.now() });
  } catch { /* ignore transient errors */ }
}

function startOledPollLoop() {
  if (_oledPollTimer || activeScenario !== "daisy") return;
  _oledPollTimer = setInterval(() => {
    pollOledFrame().catch(() => {});
  }, 300);
}

function stopOledPollLoop() {
  if (_oledPollTimer) {
    clearInterval(_oledPollTimer);
    _oledPollTimer = null;
  }
}

// ─── PC value poll loop (Daisy scenario only, 2 s) ─────────────────────────
let _pcPollTimer = null;

async function pollPcValue() {
  if (!renodeReady || !renodeRunning || (activeScenario !== "daisy" && activeScenario !== "esp32c3")) return;
  const machine = activeMachines[0];
  if (!machine) return;
  try {
    const result = await executeRenodeCommandSilent("cpu PC", machine);
    const raw = (result.return || result.output || "").trim();
    const m = raw.match(/0x[0-9a-fA-F]+/);
    if (m) emit({ type: "pc_value", machine, pc: m[0], ts: Date.now() });
  } catch { /* ignore */ }
}

function startPcPollLoop() {
  if (_pcPollTimer || (activeScenario !== "daisy" && activeScenario !== "esp32c3")) return;
  _pcPollTimer = setInterval(() => { pollPcValue().catch(() => {}); }, 2000);
}

function stopPcPollLoop() {
  if (_pcPollTimer) { clearInterval(_pcPollTimer); _pcPollTimer = null; }
}

// Cache of symbol address from map file (address is same for all machines since same ELF)
let _blinkIntervalMsAddr = undefined;

// Daisy ADC DMA buffer address — discovered at runtime from DMA controller.
// libDaisy's HAL_ADC_Start_DMA() configures DMA1_Stream2 with M0AR pointing
// to adc1_dma_buffer[].  We read that register once; null = not yet resolved.
let _daisyAdcDmaBufAddr = undefined;

function getBlinkIntervalMsAddr() {
  if (_blinkIntervalMsAddr !== undefined) return _blinkIntervalMsAddr;
  const mapPath = path.join(repoRoot, "zephyr", "build", "zephyr", "zephyr.map");
  try {
    const content = readFileSync(mapPath, "utf8");
    // Map file has the address on the line after the section name
    // .data.blink_interval_ms\n                0x00000000200000a8 ...
    const re = /\.data\.blink_interval_ms\s*\n\s*(0x[0-9a-fA-F]+)/;
    const m = content.match(re);
    if (m) {
      _blinkIntervalMsAddr = parseInt(m[1], 16);
      return _blinkIntervalMsAddr;
    }
  } catch (e) {}
  _blinkIntervalMsAddr = null;
  return null;
}

/**
 * Resolve the Daisy ADC DMA buffer address by reading DMA1_Stream2 M0AR.
 *
 * libDaisy configures DMA1_Stream2 (request: ADC1) with M0AR pointing to the
 * static adc1_dma_buffer[] in D2 SRAM.  By reading that DMA register after
 * firmware init we get the exact target address without hard-coding anything
 * or parsing map-files.
 *
 * DMA1 base: 0x40020000  Stream 2 M0AR: base + 0x01C + 2*0x018 = 0x4002004C
 */
async function getDaisyAdcDmaBufAddr(machine) {
  if (_daisyAdcDmaBufAddr !== undefined) return _daisyAdcDmaBufAddr;
  try {
    const res = await executeRenodeCommandSilent(
      "sysbus ReadDoubleWord 0x4002004C", machine);
    const text = [res.output, res.return].filter(Boolean).join(" ").trim();
    const m = text.match(/0x([0-9a-fA-F]+)/);
    if (m) {
      const addr = parseInt(m[1], 16);
      if (addr > 0 && addr < 0xFFFFFFFF) {
        _daisyAdcDmaBufAddr = addr;
        return _daisyAdcDmaBufAddr;
      }
    }
  } catch { /* not ready yet */ }
  return null;  // DMA not yet configured — try again later
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveMachine(machine) {
  if (!machine) {
    return activeMachines[0] || DEFAULT_MACHINE;
  }
  // Return the machine as-is — don't substitute stale machine names with new
  // active ones, as that would cause stale RPC calls to run against the wrong machine.
  return machine;
}

function enqueueRpc(task) {
  const next = rpcQueue.then(task, task);
  rpcQueue = next.catch(() => {});
  return next;
}

// ─── XML-RPC helpers (robot mode) ────────────────────────────────────────────

function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildRpcCall(keyword, args) {
  const data = args
    .map((a) => `<value><string>${escapeXml(a)}</string></value>`)
    .join("");
  return (
    `<?xml version="1.0"?><methodCall>` +
    `<methodName>run_keyword</methodName><params>` +
    `<param><value><string>${escapeXml(keyword)}</string></value></param>` +
    `<param><value><array><data>${data}</data></array></value></param>` +
    `</params></methodCall>`
  );
}

function parseRpcResponse(xml) {
  const faultMatch = xml.match(/<faultString>\s*<value>\s*<string>([\s\S]*?)<\/string>/i);
  if (faultMatch) {
    return {
      status: "FAIL",
      output: "",
      return: "",
      line: "",
      error: faultMatch[1].trim(),
    };
  }

  const get = (name) => {
    const m = xml.match(
      new RegExp(`<name>${name}<\\/name>\\s*<value>\\s*<string>([\\s\\S]*?)<\\/string>`, "i")
    );
    return m
      ? m[1]
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .trim()
      : "";
  };

  const getLine = () => {
    const m = xml.match(
      /<name>Line<\/name>\s*<value>\s*<string>([\s\S]*?)<\/string>/i
    );
    return m
      ? m[1]
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .trim()
      : "";
  };

  const getReturn = () => {
    const stringReturn = get("return");
    if (stringReturn) {
      return stringReturn;
    }
    const m = xml.match(/<name>return<\/name>\s*<value>\s*<i4>(-?\d+)<\/i4>/i);
    return m ? m[1] : "";
  };

  return {
    status: get("status") || "UNKNOWN",
    output: get("output"),
    return: getReturn(),
    line: getLine(),
    error: get("error"),
  };
}

function callXmlRpc(keyword, args = []) {
  return enqueueRpc(
    () =>
      new Promise((resolve, reject) => {
        const body = buildRpcCall(keyword, args);
        const req = http.request(
          {
            hostname: RENODE_ROBOT_HOST,
            port: RENODE_ROBOT_PORT,
            path: "/",
            method: "POST",
            headers: {
              "Content-Type": "text/xml",
              "Content-Length": Buffer.byteLength(body),
            },
          },
          (res) => {
            let data = "";
            res.setEncoding("utf8");
            res.on("data", (chunk) => (data += chunk));
            res.on("end", () => resolve(parseRpcResponse(data)));
          }
        );
        req.setTimeout(120_000, () => {
          req.destroy();
          reject(new Error("XML-RPC timeout"));
        });
        req.on("error", reject);
        req.write(body);
        req.end();
      })
  );
}

async function executeRenodeCommand(command, machine = DEFAULT_MACHINE) {
  const args = machine ? [command, machine] : [command];
  const result = await callXmlRpc("ExecuteCommand", args);
  const out = [result.output, result.return].filter(Boolean).join("\n").trim();
  if (out) emitLog("monitor", out, machine);
  if (result.status === "FAIL") {
    emitLog("system", `Command failed: ${result.error}`);
  }
  return result;
}

async function executeRenodeCommandSilent(command, machine = DEFAULT_MACHINE) {
  const args = machine ? [command, machine] : [command];
  return callXmlRpc("ExecuteCommand", args);
}

function parsePinLabel(pinLabel) {
  const m = String(pinLabel || "").match(/^P([A-Z])(\d+)$/);
  if (!m) {
    return null;
  }
  return {
    port: m[1],
    pin: Number(m[2]),
  };
}

function parseGpioList(text) {
  const map = new Map();
  const regex = /\((\d+),\s*GPIO:\s*(set|unset)\)/gi;
  let m = regex.exec(text);
  while (m) {
    map.set(Number(m[1]), m[2].toLowerCase() === "set");
    m = regex.exec(text);
  }
  return map;
}

// Atomically pulse a GPIO pin LOW then HIGH, advancing simulation time in between
// so the firmware can observe the press within a single RPC chain.
async function handleGpioPulse(msg) {
  if (!renodeReady) return;
  const parsed = parsePinLabel(msg.pin);
  if (!parsed) return;
  const machine = resolveMachine(msg.machine);
  if (!activeMachines.includes(machine)) return;
  const portName = `sysbus.gpioPort${parsed.port}`;

  // Drive pin LOW (active/pressed for ACTIVE_LOW button)
  await executeRenodeCommandSilent(`${portName} OnGPIO ${parsed.pin} false`, machine);
  if (!activeMachines.includes(machine)) return; // scenario may have switched during await
  emitLog("system", `GPIO ${formatGpioPin(msg.pin)} \u2192 LOW (pulse, ${machine})`, machine);

  // Advance simulation time so firmware's gpio_pin_get_dt polls see the pressed state.
  const testerId = uartTesterIdByMachine.get(machine);
  if (testerId) {
    await callXmlRpc("WaitForNextLineOnUart", [`timeout=0.1`, `testerId=${testerId}`]).catch(() => {});
  } else {
    await callXmlRpc("WaitForNextLineOnUart", [`timeout=0.1`]).catch(() => {});
  }

  // Release pin HIGH — recheck machine is still active before executing
  if (!activeMachines.includes(machine)) return;
  await executeRenodeCommandSilent(`${portName} OnGPIO ${parsed.pin} true`, machine);
  if (!activeMachines.includes(machine)) return;
  emitLog("system", `GPIO ${formatGpioPin(msg.pin)} \u2192 HIGH (pulse release, ${machine})`, machine);

  // Read back and emit final state
  const readResult = await executeRenodeCommandSilent(`${portName} GetGPIOs`, machine);
  if (readResult.status === "PASS" && activeMachines.includes(machine)) {
    const gpioMap = parseGpioList(readResult.return || readResult.output || "");
    const level = gpioMap.has(parsed.pin) ? gpioMap.get(parsed.pin) : null;
    emit({ type: "pin_state", machine, pin: msg.pin, level, ts: Date.now() });
  }
}

async function handleGpioRequest(msg) {
  if (!renodeReady) {
    if (!renodeLoading) emitLog("system", "Renode is not running or not ready yet. Start simulator first.");
    return;
  }

  const parsed = parsePinLabel(msg.pin);
  if (!parsed) {
    emitLog("system", `Invalid pin label: ${msg.pin}`);
    return;
  }

  const machine = resolveMachine(msg.machine);
  // Drop requests for machines not belonging to the currently loaded scenario
  if (!activeMachines.includes(machine)) return;
  const portName = `sysbus.gpioPort${parsed.port}`;

  if (msg.op === "write") {
    const level = Boolean(msg.level);
    const cmd = `${portName} OnGPIO ${parsed.pin} ${level ? "true" : "false"}`;
    emitLog("command", `${cmd}\n`, machine);
    emitLog("system", formatGpioLogEntry(msg.pin, level ? "HIGH" : "LOW", machine), machine);
    const writeResult = await executeRenodeCommandSilent(cmd, machine);
    if (writeResult.status === "FAIL") {
      if (activeMachines.includes(machine)) {
        emitLog("system", `GPIO write failed for ${msg.pin}: ${writeResult.error}`);
      }
      return;
    }
    // Emit the written level immediately — GetGPIOs may omit unset (LOW) pins
    gpioWriteOverrides[`${machine}:${msg.pin}`] = level;
    _gpioPrevState[`${machine}:P${parsed.port}${parsed.pin}`] = level;
    emit({ type: "pin_state", machine, pin: msg.pin, level, ts: Date.now() });
    // Advance simulation time so the firmware observes the injected level.
    if (!activeMachines.includes(machine)) return;
    const writeTid = uartTesterIdByMachine.get(machine);
    if (uartTesterReadyByMachine.get(machine)) {
      await (writeTid
        ? callXmlRpc("WaitForNextLineOnUart", [`timeout=0.1`, `testerId=${writeTid}`])
        : callXmlRpc("WaitForNextLineOnUart", [`timeout=0.1`])
      ).catch(() => {});
    }
    if (!activeMachines.includes(machine)) return;
    // Skip re-reading the written pin — level already emitted above; only read for
    // other pins on same port that firmware may have changed (e.g. LED).
    return;
  }

  const readResult = await executeRenodeCommandSilent(`${portName} GetGPIOs`, machine);
  if (readResult.status === "FAIL") {
    if (activeMachines.includes(machine)) {
      emitLog("system", `GPIO read failed for ${msg.pin}: ${readResult.error}`);
    }
    return;
  }

  const gpioMap = parseGpioList(readResult.return || readResult.output || "");
  const level = gpioMap.has(parsed.pin) ? gpioMap.get(parsed.pin) : null;
  emit({ type: "pin_state", machine, pin: msg.pin, level, ts: Date.now() });
}

async function handleGpioScanRequest(msg) {
  if (!renodeReady) return;

  const requestedPins = Array.isArray(msg.pins) ? msg.pins : [];
  const machine = resolveMachine(msg.machine);
  // Drop scans for machines not in the active scenario
  if (!activeMachines.includes(machine)) return;
  if (!requestedPins.length) return;

  const grouped = new Map();
  for (const pinLabel of requestedPins) {
    const parsed = parsePinLabel(pinLabel);
    if (!parsed) {
      continue;
    }
    const key = parsed.port;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push({ label: pinLabel, pin: parsed.pin });
  }

  for (const [port, pins] of grouped.entries()) {
    const result = await executeRenodeCommandSilent(`sysbus.gpioPort${port} GetGPIOs`, machine);
    if (result.status === "FAIL") {
      if (activeMachines.includes(machine) && !renodeLoading) {
        emitLog("system", `GPIO scan failed for port ${port}: ${result.error}`);
      }
      continue;
    }

    const gpioMap = parseGpioList(result.return || result.output || "");
    for (const item of pins) {
      const fromMap = gpioMap.has(item.pin) ? gpioMap.get(item.pin) : undefined;
      // If the pin isn't listed by GetGPIOs (Renode omits unset pins), fall back
      // to the last value we explicitly wrote via OnGPIO so the UI stays correct.
      const override = gpioWriteOverrides[`${machine}:P${port}${item.pin}`];
      const level = fromMap !== undefined ? fromMap : (override !== undefined ? override : null);
      emit({ type: "pin_state", machine, pin: item.label, level, ts: Date.now() });
    }
  }
}

async function executeRenodeScript(scriptPath) {
  const result = await callXmlRpc("ExecuteScript", [scriptPath]);
  const out = [result.output, result.return].filter(Boolean).join("\n").trim();
  if (out) emitLog("monitor", out);
  if (result.status === "FAIL") {
    emitLog("system", `Script failed: ${result.error}`);
  }
  return result;
}

// If a daisy ELF override is set (env or runtime), tell Renode about it
// BEFORE the .resc script is loaded.  The script uses $elf ?= <default>.
let _daisyElfOverride = DAISY_ELF;
let _discoveryElfOverride = "";
let _esp32c3ElfOverride = "";

async function setDaisyElfVariable(elfPath) {
  const elf = elfPath || _daisyElfOverride;
  if (!elf || activeScenario !== "daisy") return;
  const elfPosix = path.resolve(repoRoot, elf).replace(/\\/g, "/");
  emitLog("system", `Setting Renode $elf = ${elfPosix}`);
  await callXmlRpc("ExecuteCommand", [`$elf=@${elfPosix}`]);
}

async function setEsp32c3ElfVariable(elfPath) {
  const elf = elfPath || _esp32c3ElfOverride;
  if (!elf || activeScenario !== "esp32c3") return;
  const elfPosix = path.resolve(repoRoot, elf).replace(/\\/g, "/");
  emitLog("system", `Setting Renode $elf = ${elfPosix}`);
  await callXmlRpc("ExecuteCommand", [`$elf=@${elfPosix}`]);
}

async function startUartStreaming(machine = DEFAULT_MACHINE) {
  const targetMachine = resolveMachine(machine);
  let testerReady = false;
  for (let i = 0; i < 20 && renodeRunning && renodeReady; i += 1) {
    try {
      const createResult = await callXmlRpc("CreateTerminalTester", [activeUartPeripheral, "", targetMachine]);
      if (createResult.status === "PASS") {
        const idSource = [createResult.return, createResult.output, createResult.line]
          .filter(Boolean)
          .join(" ");
        const idMatch = idSource.match(/\b\d+\b/);
        if (idMatch) {
          uartTesterIdByMachine.set(targetMachine, idMatch[0]);
        }
        testerReady = true;
        break;
      }
      if (createResult.error && /no machine/i.test(createResult.error) && i === 3) {
        // Re-include once if machine context was lost.
        await executeRenodeScript(simScriptPosix);
      }
      if (createResult.error && !/no machine/i.test(createResult.error)) {
        emitLog("system", `Could not create UART tester: ${createResult.error}`);
        return;
      }
    } catch (err) {
      emitLog("system", `Could not create UART tester: ${err.message}`);
      return;
    }
    await sleep(200);
  }

  if (!testerReady) {
    emitLog("system", "Could not create UART tester: machine not ready yet");
    return;
  }

  uartTesterReadyByMachine.set(targetMachine, true);
  const testerId = uartTesterIdByMachine.get(targetMachine);
  if (testerId) {
    emitLog("system", `UART streaming enabled on ${activeUartPeripheral} (${targetMachine}, tester ${testerId})`, targetMachine);
  } else {
    emitLog("system", `UART streaming enabled on ${activeUartPeripheral} (${targetMachine})`, targetMachine);
  }
}

async function drainUartLines(machine = DEFAULT_MACHINE, maxLines = 2, timeoutSeconds) {
  if (timeoutSeconds === undefined) timeoutSeconds = activeScenario === "daisy" ? "0.0005" : "0.05";
  const targetMachine = resolveMachine(machine);
  // Bail if this machine is no longer part of the active scenario
  if (!activeMachines.includes(machine) && !activeMachines.includes(targetMachine)) return;
  if (!uartTesterReadyByMachine.get(targetMachine) || !renodeReady || !renodeRunning) {
    return;
  }

  for (let i = 0; i < maxLines; i += 1) {
    // Re-check on every iteration — scenario may have switched mid-loop
    if (!activeMachines.includes(machine) && !activeMachines.includes(targetMachine)) return;
    if (!uartTesterReadyByMachine.get(targetMachine) || !renodeReady || !renodeRunning) return;
    try {
      const testerId = uartTesterIdByMachine.get(targetMachine);
      let res = testerId
        ? await callXmlRpc("WaitForNextLineOnUart", [`timeout=${timeoutSeconds}`, `testerId=${testerId}`])
        : await callXmlRpc("WaitForNextLineOnUart", [`timeout=${timeoutSeconds}`]);

      if (
        res.status !== "PASS" &&
        testerId &&
        res.error &&
        /more than one tester available/i.test(res.error)
      ) {
        // Compatibility fallback for environments requiring testerId-only named argument.
        res = await callXmlRpc("WaitForNextLineOnUart", [`testerId=${testerId}`]);
      }

      if (res.status !== "PASS") {
        if (res.error && /no testers available/i.test(res.error)) {
          uartTesterReadyByMachine.set(targetMachine, false);
          uartTesterIdByMachine.delete(targetMachine);
        }
        const expectedNoLine =
          res.error &&
          (/timeout/i.test(res.error) ||
            /Terminal tester failed/i.test(res.error) ||
            /Next line event: failure/i.test(res.error));

        if (res.error && !expectedNoLine && !/no testers available/i.test(res.error) && activeMachines.includes(targetMachine) && !renodeLoading) {
          emitLog("system", `UART read error: ${res.error}`, targetMachine);
        }
        return;
      }

      const line = res.line || res.return;
      if (line) {
        emitLog("uart", line, targetMachine);
      }
    } catch (err) {
      emitLog("system", `UART read failed: ${err.message}`, targetMachine);
      return;
    }
  }
}

function startUartDrainLoop(machine) {
  const targetMachine = resolveMachine(machine);
  if (uartDrainTimers.has(targetMachine)) {
    return;
  }
  const id = setInterval(() => {
    drainUartLines(targetMachine).catch(() => {});
  }, 200);
  uartDrainTimers.set(targetMachine, id);
}

function stopUartDrainLoops() {
  for (const id of uartDrainTimers.values()) {
    clearInterval(id);
  }
  uartDrainTimers.clear();
}

async function startHubStreaming(machine = DEFAULT_MACHINE) {
  const targetMachine = resolveMachine(machine);
  let testerReady = false;
  for (let i = 0; i < 20 && renodeRunning && renodeReady; i += 1) {
    try {
      const createResult = await callXmlRpc("CreateTerminalTester", [activeHubPeripheral, "", targetMachine]);
      if (createResult.status === "PASS") {
        const idSource = [createResult.return, createResult.output, createResult.line]
          .filter(Boolean)
          .join(" ");
        const idMatch = idSource.match(/\b\d+\b/);
        if (idMatch) {
          hubTesterIdByMachine.set(targetMachine, idMatch[0]);
        }
        testerReady = true;
        break;
      }
      if (createResult.error && !/no machine/i.test(createResult.error)) {
        emitLog("system", `Could not create hub tester: ${createResult.error}`);
        return;
      }
    } catch (err) {
      emitLog("system", `Could not create hub tester: ${err.message}`);
      return;
    }
    await sleep(200);
  }
  if (!testerReady) return;
  hubTesterReadyByMachine.set(targetMachine, true);
  emitLog("system", `Hub streaming enabled on ${activeHubPeripheral} (${targetMachine})`, targetMachine);
}

async function drainHubLines(machine = DEFAULT_MACHINE, maxLines = 4, timeoutSeconds = "0.05") {
  const targetMachine = resolveMachine(machine);
  if (!activeMachines.includes(machine) && !activeMachines.includes(targetMachine)) return;
  if (!hubTesterReadyByMachine.get(targetMachine) || !renodeReady || !renodeRunning) return;
  for (let i = 0; i < maxLines; i += 1) {
    if (!activeMachines.includes(machine) && !activeMachines.includes(targetMachine)) return;
    if (!hubTesterReadyByMachine.get(targetMachine) || !renodeReady || !renodeRunning) return;
    try {
      const testerId = hubTesterIdByMachine.get(targetMachine);
      let res = testerId
        ? await callXmlRpc("WaitForNextLineOnUart", [`timeout=${timeoutSeconds}`, `testerId=${testerId}`])
        : await callXmlRpc("WaitForNextLineOnUart", [`timeout=${timeoutSeconds}`]);
      if (res.status !== "PASS") {
        if (res.error && /no testers available/i.test(res.error)) {
          hubTesterReadyByMachine.set(targetMachine, false);
          hubTesterIdByMachine.delete(targetMachine);
        }
        return;
      }
      const line = res.line || res.return;
      if (line) {
        emitLog("hub", line, targetMachine);
      }
    } catch (err) {
      return;
    }
  }
}

function startHubDrainLoop(machine) {
  const targetMachine = resolveMachine(machine);
  if (hubDrainTimers.has(targetMachine)) return;
  const id = setInterval(() => {
    drainHubLines(targetMachine).catch(() => {});
  }, 200);
  hubDrainTimers.set(targetMachine, id);
}

function stopHubDrainLoops() {
  for (const id of hubDrainTimers.values()) {
    clearInterval(id);
  }
  hubDrainTimers.clear();
}

// ─── GPIO push loop ───────────────────────────────────────────────────────────
// Tracked GPIO ports and their pins for the push scan
const GPIO_PUSH_PORTS_DISCOVERY = {
  A: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  B: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  D: [12, 13, 14, 15],
};
const DAISY_PIN_LABELS = {
  PA0: "D25·A10", PA1: "D24·A9",  PA2: "D28·A11 Pin35", PA3: "D16·A1",
  PA4: "D23·A8",  PA5: "D22·A7",  PA6: "D19·A4",        PA7: "D18·A3",  PA15: "Zephyr led0",
  PB1: "D17·A2",  PB4: "D9",      PB5: "D10",           PB6: "D13",   PB7: "D14",
  PB8: "D11",     PB9: "D12",     PB12: "D0",           PB14: "D29",  PB15: "D30",
  PC0: "D15·A0",  PC1: "D20·A5",  PC4: "D21·A6",        PC7: "LED",
  PC8: "D4",      PC9: "D3",      PC10: "D2",           PC11: "D1",   PC12: "D6",
  PD2: "D5",      PD11: "D26",    PG9: "D27",           PG10: "D7",   PG11: "D8",
};
function formatGpioPin(pin) {
  if (activeScenario !== "daisy") return pin;
  const lbl = DAISY_PIN_LABELS[pin];
  return lbl ? `${lbl} → STM32 GPIO ${pin}` : `GPIO ${pin}`;
}
function formatGpioLogEntry(pin, levelStr, machine) {
  if (activeScenario === "daisy") {
    const lbl = DAISY_PIN_LABELS[pin];
    if (lbl) return `${lbl} → STM32 GPIO ${pin} → ${levelStr}`;
  }
  return `GPIO ${pin} → ${levelStr} (${machine})`;
}

const GPIO_PUSH_PORTS_DAISY = {
  A: [0, 1, 2, 3, 4, 5, 6, 7, 15],      // D25,D24,D28(btn),D16,D23,D22,D19,D18,led0
  B: [1, 4, 5, 6, 7, 8, 9, 12, 14, 15], // D17,D9-D14,D0,D29,D30
  C: [0, 1, 4, 7, 8, 9, 10, 11, 12],    // D15,D20,D21,LED,D4,D3,D2,D1,D6
};
function getGpioPushPorts() {
  return activeScenario === "daisy" ? GPIO_PUSH_PORTS_DAISY : GPIO_PUSH_PORTS_DISCOVERY;
}

const GPIO_PUSH_PINS_ESP32C3 = [5]; // onboard LED pin for blink demo

let _gpioPrevState = {}; // key: `${machine}:P${port}${pin}` -> level
const gpioWriteOverrides = {}; // key: `${machine}:PIN` -> level (for unset/LOW pins omitted by GetGPIOs)
const gpioScanTimers = new Map();

async function pushGpioState(machine) {
  if (!renodeReady || !renodeRunning) return;
  if (activeScenario === "esp32c3") {
    // For the custom esp32c3.repl we expose GPIO state via plain memory register:
    // GPIO_OUT register at 0x60004004 (bit N = GPIO N output level)
    let result;
    try {
      result = await executeRenodeCommandSilent("sysbus ReadDoubleWord 0x60004004", machine);
    } catch {
      return;
    }
    if (!result || result.status === "FAIL") return;
    const raw = `${result.return || ""} ${result.output || ""}`;
    const m = raw.match(/0x([0-9a-fA-F]+)/);
    const outReg = m ? parseInt(m[1], 16) >>> 0 : 0;
    for (const pinNum of GPIO_PUSH_PINS_ESP32C3) {
      const level = Boolean(outReg & (1 << pinNum));
      const key = `${machine}:GPIO${pinNum}`;
      if (_gpioPrevState[key] !== level) {
        _gpioPrevState[key] = level;
        emit({ type: "pin_state", machine, pin: `GPIO${pinNum}`, level, ts: Date.now() });
      }
    }
    return;
  }
  for (const [port, pins] of Object.entries(getGpioPushPorts())) {
    let result;
    try {
      result = await executeRenodeCommandSilent(`sysbus.gpioPort${port} GetGPIOs`, machine);
    } catch { return; }
    if (!result || result.status === "FAIL") continue;
    const raw = result.return || result.output || "";
    const gpioMap = parseGpioList(raw);
    for (const pinNum of pins) {
      const fromMap = gpioMap.has(pinNum) ? gpioMap.get(pinNum) : undefined;
      const overrideKey = `${machine}:P${port}${pinNum}`;
      const override = gpioWriteOverrides[overrideKey];
      // Override (written level) takes priority over Renode read — floating/pull-up pins
      // alternate randomly in GetGPIOs, so we trust what we explicitly wrote.
      const level = override !== undefined ? override : (fromMap !== undefined ? fromMap : null);
      const key = overrideKey;
      // PA2 (Daisy Seed LED output) is toggled by software PWM at ~120 Hz.
      // Always emit its state on every poll tick so the frontend can compute
      // a rolling average that approximates the actual duty cycle.
      // Bypass gpioWriteOverrides for this pin — we want actual firmware output,
      // not the level we injected for button simulation.
      const alwaysEmit = activeScenario === "daisy" && port === "A" && pinNum === 2;
      const sampleLevel = alwaysEmit
        ? (fromMap !== undefined ? fromMap : null)
        : level;
      if (alwaysEmit || _gpioPrevState[key] !== sampleLevel) {
        _gpioPrevState[key] = sampleLevel;
        emit({ type: "pin_state", machine, pin: `P${port}${pinNum}`, level: sampleLevel, ts: Date.now() });
      }
    }
  }
}

function startGpioPushLoop(machine) {
  const m = resolveMachine(machine);
  if (gpioScanTimers.has(m)) return;
  const id = setInterval(() => {
    pushGpioState(m).catch(() => {});
  }, 100);
  gpioScanTimers.set(m, id);
}

function stopGpioPushLoops() {
  for (const id of gpioScanTimers.values()) clearInterval(id);
  gpioScanTimers.clear();
  _gpioPrevState = {};
  Object.keys(gpioWriteOverrides).forEach((k) => delete gpioWriteOverrides[k]);
}

async function connectToRobotServer() {
  if (renodeConnecting) {
    return;
  }
  if (_renodeRetryTimer) {
    clearTimeout(_renodeRetryTimer);
    _renodeRetryTimer = null;
  }

  renodeConnecting = true;
  renodeReady = false;
  uartTesterReadyByMachine.clear();
  uartTesterIdByMachine.clear();
  stopUartDrainLoops();
  hubTesterReadyByMachine.clear();
  hubTesterIdByMachine.clear();
  stopHubDrainLoops();
  stopGpioPushLoops();

  try {
    emitLog(
      "system",
      `Connecting to Renode XML-RPC robot server at ${RENODE_ROBOT_HOST}:${RENODE_ROBOT_PORT}…`
    );
    const ping = await callXmlRpc("ExecuteCommand", ["version"]);
    if (ping.status === "FAIL") {
      throw new Error(ping.error || "version command failed");
    }
    const version = [ping.output, ping.return].filter(Boolean).join(" ").trim();
    emitLog("system", `Connected to Renode robot server. ${version}`);

    if (activeScenario !== "none") {
      emitLog("system", `Loading script: ${simScriptPosix}`);
      await setDaisyElfVariable();
      const includeResult = await executeRenodeScript(simScriptPosix);
      if (includeResult.status === "FAIL") {
        emitLog("system", `Include warning: ${includeResult.error || "unknown include failure"}`);
      }
    } else {
      emitLog("system", "No scenario selected — waiting for user to load a board.");
    }

    renodeRunning = true;
    renodeReady = true;
    emit({ type: "status", running: true, ts: Date.now() });

    for (const machine of activeMachines) {
      await startUartStreaming(machine);
      // For Daisy and esp32c3: the resc does not call start so simulation is paused until
      // the tester is ready. Start it now so no startup UART output is missed.
      if (activeScenario === "daisy" || activeScenario === "esp32c3") {
        // Pass no machine context — 'start' is a global emulation command.
        const startRes = await callXmlRpc("ExecuteCommand", ["start"]).catch(e => ({ status: "FAIL", error: e.message }));
        emitLog("system", `Simulation start: ${startRes.status}${startRes.error ? " — " + startRes.error : ""}`, machine);
      }
      const initDrainLines   = activeScenario === "daisy" ? 15 : (activeScenario === "esp32c3" ? 5 : 15);
      const initDrainTimeout = activeScenario === "daisy" ? "0.05" : (activeScenario === "esp32c3" ? "2.0" : "0.05");
      await drainUartLines(machine, initDrainLines, initDrainTimeout);

      startUartDrainLoop(machine);
      if (activeHubPeripheral) {
        await startHubStreaming(machine);
        startHubDrainLoop(machine);
      }
      startGpioPushLoop(machine);
    }
    if (activeScenario === "daisy") startOledPollLoop();
    if (activeScenario === "daisy" || activeScenario === "esp32c3") startPcPollLoop();
  } catch (err) {
    renodeRunning = false;
    renodeReady = false;
    uartTesterReadyByMachine.clear();
    uartTesterIdByMachine.clear();
    stopUartDrainLoops();
    hubTesterReadyByMachine.clear();
    hubTesterIdByMachine.clear();
    stopHubDrainLoops();
    stopGpioPushLoops();
    stopOledPollLoop();
    stopPcPollLoop();
    emit({ type: "status", running: false, ts: Date.now() });
    emitLog("system", `Cannot connect to Renode: ${err.message || "no response"} — retrying in 5s…`);
    _renodeRetryTimer = setTimeout(() => {
      _renodeRetryTimer = null;
      if (!renodeRunning) connectToRobotServer();
    }, 5000);
  } finally {
    renodeConnecting = false;
  }
}

async function handleLoadScript(scenario) {
  if (!renodeReady) {
    emitLog("system", "Cannot switch scenario: Renode not ready.");
    return;
  }

  emitLog("system", `Switching to ${scenario} scenario…`);
  renodeLoading = true;
  renodeReady = false;
  emit({ type: "status", running: false, ts: Date.now() });

  // Tear down existing streamers
  stopUartDrainLoops();
  stopHubDrainLoops();
  stopGpioPushLoops();
  stopOledPollLoop();
  stopPcPollLoop();
  uartTesterReadyByMachine.clear();
  uartTesterIdByMachine.clear();
  hubTesterReadyByMachine.clear();
  hubTesterIdByMachine.clear();
  _gpioPrevState = {};
  _daisyAdcDmaBufAddr = undefined;
  Object.keys(gpioWriteOverrides).forEach((k) => delete gpioWriteOverrides[k]);
  // Remove all currently active machines from Renode one by one
  const machinesToRemove = [...activeMachines]; // snapshot before we overwrite activeMachines

  // Update active config first so resolveMachine works for the new scenario
  if (scenario === "daisy") {
    activeMachines       = ["daisy_0"];
    activeUartPeripheral = "sysbus.usart1";
    activeHubPeripheral  = null;
  } else if (scenario === "esp32c3") {
    activeMachines       = ["esp32c3_0"];
    activeUartPeripheral = "sysbus.uart0";
    activeHubPeripheral  = null;
  } else {
    activeMachines       = ["board_0", "board_1"];
    activeUartPeripheral = "sysbus.usart3";
    activeHubPeripheral  = "sysbus.usart2";
  }
  activeScenario = scenario;

  // Flush any queued RPC calls from stopped loops
  rpcQueue = Promise.resolve();

  // Remove old machines — 'Clear' resets the full emulation
  for (const m of machinesToRemove) {
    emitLog("system", `Clearing machine ${m}…`);
  }
  const clearResult = await executeRenodeCommandSilent("Clear", null).catch((e) => ({ status: "FAIL", error: e.message }));
  emitLog("system", `Clear: ${clearResult.status === "PASS" ? "OK" : (clearResult.error || clearResult.status)}`);
  await sleep(300); // let Renode settle
  try { unlinkSync(OLED_FRAME_PATH); } catch { /* ok if missing */ }

  const newScript = scenario === "daisy"
    ? path.join(repoRoot, "renode", "daisy", "daisy_seed.resc")
    : scenario === "esp32c3"
      ? path.join(repoRoot, "renode", "esp32c3", "esp32c3.resc")
      : path.join(repoRoot, "renode", "discovery", "discovery_dual.resc");
  const newScriptPosix = newScript.replace(/\\/g, "/");
  emitLog("system", `Loading script: ${newScriptPosix}`);

  await setDaisyElfVariable();
  await setEsp32c3ElfVariable();
  if (scenario === "discovery" && _discoveryElfOverride) {
    const _elfPosix = path.resolve(repoRoot, _discoveryElfOverride).replace(/\\/g, "/");
    emitLog("system", `Setting Renode $elf = ${_elfPosix}`);
    await callXmlRpc("ExecuteCommand", [`$elf=@${_elfPosix}`]);
  }
  const result = await executeRenodeScript(newScriptPosix);
  emitLog("system", `ExecuteScript result: ${result.status}${result.error ? " — " + result.error : ""}`);
  if (result.status === "FAIL") {
    emitLog("system", `Load failed: ${result.error}`);
    renodeLoading = false;
    return;
  }

  renodeRunning = true;
  renodeReady   = true;
  renodeLoading = false;
  emit({ type: "status", running: true, ts: Date.now() });
  emit({ type: "script_loaded", scenario, machines: activeMachines, ts: Date.now() });

  for (const machine of activeMachines) {
    await startUartStreaming(machine);
    if (activeScenario === "daisy" || activeScenario === "esp32c3") {
      const startRes = await callXmlRpc("ExecuteCommand", ["start"]).catch(e => ({ status: "FAIL", error: e.message }));
      emitLog("system", `Simulation start: ${startRes.status}${startRes.error ? " — " + startRes.error : ""}`, machine);
    }
    const drainTimeout = activeScenario === "daisy" ? "0.0005" : "2.0";
    const drainLines  = activeScenario === "daisy" ? 2 : 5;
    await drainUartLines(machine, drainLines, drainTimeout);
    startUartDrainLoop(machine);
    if (activeHubPeripheral) {
      await startHubStreaming(machine);
      startHubDrainLoop(machine);
    }
    startGpioPushLoop(machine);
  }
  if (activeScenario === "daisy") startOledPollLoop();
  if (activeScenario === "daisy" || activeScenario === "esp32c3") startPcPollLoop();
}

async function handleClear() {
  emitLog("system", "Clearing simulation\u2026");
  stopUartDrainLoops();
  stopHubDrainLoops();
  stopGpioPushLoops();
  stopOledPollLoop();
  stopPcPollLoop();
  uartTesterReadyByMachine.clear();
  uartTesterIdByMachine.clear();
  hubTesterReadyByMachine.clear();
  hubTesterIdByMachine.clear();
  _gpioPrevState = {};
  Object.keys(gpioWriteOverrides).forEach((k) => delete gpioWriteOverrides[k]);
  renodeRunning = false;
  renodeReady = false;
  activeMachines = [];
  activeScenario = "none";
  _daisyElfOverride = DAISY_ELF;
  _discoveryElfOverride = "";
  _esp32c3ElfOverride = "";
  rpcQueue = Promise.resolve();
  emit({ type: "status", running: false, ts: Date.now() });
  // Delete stale OLED frame file so the display shows NO SIGNAL after clear
  try { unlinkSync(OLED_FRAME_PATH); } catch { /* ok if missing */ }
  const cr = await executeRenodeCommandSilent("Clear", null).catch(() => ({ status: "PASS" }));
  emitLog("system", `Clear: ${cr.status === "PASS" ? "OK" : (cr.error || "done")}`);
  await sleep(300);
  renodeReady = true;
  emit({ type: "cleared", ts: Date.now() });
}

const clients = new Set();

const LOG_BUFFER_MAX = 500;
const logBuffer = [];

function emit(payload) {
  const message = JSON.stringify(payload);
  for (const client of clients) {
    if (client.readyState === 1) {
      client.send(message);
    }
  }
}

function emitLog(stream, text, machine = null) {
  const payload = { type: "log", stream, text, machine, ts: Date.now() };
  logBuffer.push(payload);
  if (logBuffer.length > LOG_BUFFER_MAX) logBuffer.shift();
  emit(payload);

  if (text.includes("LED ON")) {
    emit({ type: "state", led: "on", ts: Date.now() });
  }
  if (text.includes("LED OFF")) {
    emit({ type: "state", led: "off", ts: Date.now() });
  }
}

function startRenode() {
  if (RENODE_MODE === "robot") {
    if (renodeRunning && renodeReady) {
      for (const machine of activeMachines) {
        if (!uartTesterReadyByMachine.get(machine)) {
          startUartStreaming(machine)
            .then(() => {
              startUartDrainLoop(machine);
              return drainUartLines(machine).catch(() => {});
            })
            .catch(() => {});
        }
      }
      return;
    }
    connectToRobotServer();
    return;
  }

  if (RENODE_MODE === "external") {
    connectToExternalRenode();
    return;
  }

  if (renode) {
    return;
  }

  renodeReady = false;
  renode = spawn(renodeCmd, [simScript], {
    cwd: repoRoot,
    stdio: ["pipe", "pipe", "pipe"],
    shell: false,
  });

  renodeRunning = true;
  emit({ type: "status", running: true, ts: Date.now() });
  emitLog("system", `Started Renode with ${simScript}`);

  renode.stdout.setEncoding("utf8");
  renode.stderr.setEncoding("utf8");

  renode.stdout.on("data", (chunk) => {
    const output = chunk.toString();
    emitLog("stdout", output);
    
    // Detect when Renode is fully started and ready for commands
    if (output.includes("Machine started")) {
      renodeReady = true;
      emitLog("system", "Renode is ready to receive commands.");
    }
  });

  renode.stderr.on("data", (chunk) => {
    emitLog("stderr", chunk);
  });

  renode.on("error", (err) => {
    emitLog("system", `Renode spawn error: ${err.message}`);
  });

  renode.on("close", (code, signal) => {
    emitLog("system", `Renode stopped (code=${code}, signal=${signal || "none"})`);
    renode = null;
    renodeRunning = false;
    renodeReady = false;
    emit({ type: "status", running: false, ts: Date.now() });
  });
}

function connectToExternalRenode() {
  if (!RENODE_MONITOR_PORT || Number.isNaN(RENODE_MONITOR_PORT)) {
    emitLog(
      "system",
      "External mode requires RENODE_MONITOR_PORT. Example: RENODE_MODE=external RENODE_MONITOR_PORT=33334"
    );
    return;
  }

  if (renodeSocket) {
    return;
  }

  renodeSocket = net.createConnection(
    {
      host: RENODE_MONITOR_HOST,
      port: RENODE_MONITOR_PORT,
    },
    () => {
      renodeRunning = true;
      renodeReady = true;
      emit({ type: "status", running: true, ts: Date.now() });
      emitLog(
        "system",
        `Connected to external Renode monitor at ${RENODE_MONITOR_HOST}:${RENODE_MONITOR_PORT}`
      );
    }
  );

  renodeSocket.setEncoding("utf8");

  renodeSocket.on("data", (chunk) => {
    emitLog("monitor", chunk.toString());
  });

  renodeSocket.on("error", (err) => {
    emitLog("system", `External Renode connection error: ${err.message}`);
  });

  renodeSocket.on("close", () => {
    emitLog("system", "Disconnected from external Renode monitor");
    renodeSocket = null;
    renodeRunning = false;
    renodeReady = false;
    emit({ type: "status", running: false, ts: Date.now() });
  });
}

function stopRenode() {
  if (RENODE_MODE === "robot") {
    // We don't own the Renode process — just mark as disconnected
    uartTesterReadyByMachine.clear();
    uartTesterIdByMachine.clear();
    stopUartDrainLoops();
    renodeRunning = false;
    renodeReady = false;
    emit({ type: "status", running: false, ts: Date.now() });
    emitLog("system", "Disconnected from Renode robot server (Renode process still running)");
    return;
  }

  if (RENODE_MODE === "external") {
    if (!renodeSocket) {
      return;
    }
    renodeSocket.end();
    return;
  }

  if (!renode) {
    return;
  }
  renode.kill("SIGINT");
}

function sendMonitorCommand(command, machine = DEFAULT_MACHINE) {
  if (!renodeReady) {
    if (!renodeLoading) emitLog("system", "Renode is not running or not ready yet. Start simulator first.");
    return;
  }

  if (RENODE_MODE === "robot") {
    emitLog("command", `${command}\n`, resolveMachine(machine));
    executeRenodeCommand(command, resolveMachine(machine)).catch((err) => {
      emitLog("system", `XML-RPC error: ${err.message}`);
    }).finally(() => {
      for (const boardMachine of MACHINES) {
        drainUartLines(boardMachine).catch((err) => emitLog("system", `UART drain error: ${err.message}`, boardMachine));
      }
    });
    return;
  }

  const fullCommand = `${command}\n`;

  if (RENODE_MODE === "external") {
    if (!renodeSocket || renodeSocket.destroyed || !renodeSocket.writable) {
      emitLog("system", "External Renode monitor is not connected.");
      return;
    }
    renodeSocket.write(fullCommand);
  } else {
    if (!renode || !renode.stdin.writable) {
      emitLog("system", "Renode process is not available.");
      return;
    }
    renode.stdin.write(fullCommand);
  }

  emitLog("command", fullCommand);
}

const httpServer = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, running: renodeRunning }));
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not_found" }));
});

const wss = new WebSocketServer({ server: httpServer });

wss.on("connection", (ws) => {
  console.log("WebSocket client connected");

  // Send current state and buffered log history before joining broadcast set
  ws.send(JSON.stringify({
    type: "hello",
    running: renodeRunning,
    scenario: activeScenario,
    elf_list: scanDaisyElfs(),
    discovery_elf_list: scanDiscoveryElfs(),
    esp32c3_elf_list: scanEsp32c3Elfs(),
    ts: Date.now(),
  }));
  for (const entry of logBuffer) {
    if (ws.readyState === 1) ws.send(JSON.stringify(entry));
  }

  clients.add(ws);
  emitLog("system", "WebSocket client connected");

  if (AUTO_START_RENODE && !renodeRunning) {
    startRenode();
  }

  ws.on("message", (raw) => {
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
          sendMonitorCommand("gpioPortA.UserButton Toggle", machine);
          return;
        }
        if (msg.action === "press_button") {
          sendMonitorCommand("gpioPortA.UserButton Pressed true", machine);
          return;
        }
        if (msg.action === "release_button") {
          sendMonitorCommand("gpioPortA.UserButton Pressed false", machine);
          return;
        }
      }

      if (msg.type === "load_script" && typeof msg.scenario === "string") {
        // Optional: msg.elf overrides the ELF loaded by the daisy scenario
        if (typeof msg.elf === "string" && msg.elf) {
          if (msg.scenario === "daisy") _daisyElfOverride = msg.elf;
          if (msg.scenario === "esp32c3") _esp32c3ElfOverride = msg.elf;
        }
        handleLoadScript(msg.scenario).catch((err) =>
          emitLog("system", `Load script error: ${err.message}`)
        );
        return;
      }

      if (msg.type === "select_binary" && typeof msg.elf === "string") {
        const _selScenario =
          msg.scenario === "discovery" ? "discovery" :
          msg.scenario === "esp32c3" ? "esp32c3" :
          "daisy";
        if (_selScenario === "discovery") _discoveryElfOverride = msg.elf;
        else if (_selScenario === "esp32c3") _esp32c3ElfOverride = msg.elf;
        else _daisyElfOverride = msg.elf;
        handleLoadScript(_selScenario).catch((err) =>
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
          // Daisy Seed ADC — Knob.cpp uses DMA-based AdcHandle.
          // GetFloat(0) reads adc1_dma_buffer[0] / 65536.0  (16-bit, 0–65535).
          //
          // Our Python ADC stub (stm32h7_adc_stub.py) makes init succeed, but
          // can't trigger DMA requests.  Instead we write directly to the DMA
          // buffer.  The address is read from DMA1_Stream2 M0AR — the register
          // that firmware itself programmed during HAL_ADC_Start_DMA().
          const DAISY_ADC_PINS = new Set(["PC4"]);
          if (!DAISY_ADC_PINS.has(msg.pin)) {
            emitLog("system", `No ADC mapping for pin ${msg.pin} (daisy)`, machine);
            return;
          }
          getDaisyAdcDmaBufAddr(machine).then((bufAddr) => {
            if (bufAddr === null) {
              emitLog("system", `ADC DMA buffer not yet resolved — firmware may still be initialising`, machine);
              return;
            }
            const raw16 = Math.max(0, Math.min(65535, Math.round((parseFloat(v) / 3.3) * 65535)));
            const cmd = `sysbus WriteWord 0x${bufAddr.toString(16)} ${raw16}`;
            executeRenodeCommand(cmd, machine)
              .then(() => {
                emitLog("system", `ADC ${msg.pin}: ${v}V → dma_buf[0]=${raw16} (${(parseFloat(v)/3.3*100).toFixed(0)}%)`, machine);
              })
              .catch(() => {});
          }).catch(() => {});
          return;
        }

        // Discovery board ADC
        const PIN_TO_ADC_CH = { PA1: 1, PA6: 6 };
        const ch = PIN_TO_ADC_CH[msg.pin];
        if (ch !== undefined) {
          // SetVoltage tells Renode's ADC model about the voltage (for simulation fidelity)
          executeRenodeCommandSilent(`sysbus.adc1 SetVoltage ${ch} ${v}`, machine).catch(() => {});
          // Compute blink_interval_ms from voltage and write directly to firmware RAM
          const blinkMs = Math.max(100, Math.round(2000 - (parseFloat(v) / 3.3) * 1900));
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

  ws.on("close", () => {
    clients.delete(ws);
  });
});

httpServer.listen(PORT, "localhost", () => {
  console.log(`Renode bridge on http://localhost:${PORT}`);
  console.log(`WebSocket server listening on ws://localhost:${PORT}`);
  console.log(`Mode: ${RENODE_MODE}`);
  if (RENODE_MODE === "robot") {
    console.log(`XML-RPC robot server: ${RENODE_ROBOT_HOST}:${RENODE_ROBOT_PORT}`);
  }
});
