import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import { fileURLToPath } from "node:url";
import path from "node:path";
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
const MACHINES = (process.env.RENODE_MACHINES || "board_0,board_1")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const DEFAULT_MACHINE = MACHINES[0] || "board_0";
const thisFile = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(thisFile), "..");
const simScript = process.env.RENODE_SCRIPT
  ? path.resolve(repoRoot, process.env.RENODE_SCRIPT)
  : path.join(repoRoot, "zephyr", "renode", "discovery_dual.resc");
const simScriptPosix = simScript.replace(/\\/g, "/");
const renodeCmd = process.env.RENODE_CMD || "renode";

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
let _renodeRetryTimer = null;
let rpcQueue = Promise.resolve();

// Cache of symbol address from map file (address is same for all machines since same ELF)
let _blinkIntervalMsAddr = undefined;

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveMachine(machine) {
  if (!machine) {
    return DEFAULT_MACHINE;
  }
  return MACHINES.includes(machine) ? machine : DEFAULT_MACHINE;
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
        req.setTimeout(12000, () => {
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
    map.set(Number(m[1]), m[2].toLowerCase() === "set" ? true : null);
    m = regex.exec(text);
  }
  return map;
}

async function handleGpioRequest(msg) {
  if (!renodeReady) {
    emitLog("system", "Renode is not running or not ready yet. Start simulator first.");
    return;
  }

  const parsed = parsePinLabel(msg.pin);
  if (!parsed) {
    emitLog("system", `Invalid pin label: ${msg.pin}`);
    return;
  }

  const machine = resolveMachine(msg.machine);
  const portName = `sysbus.gpioPort${parsed.port}`;

  if (msg.op === "write") {
    const level = Boolean(msg.level);
    const cmd = `${portName} OnGPIO ${parsed.pin} ${level ? "true" : "false"}`;
    emitLog("command", `${cmd}\n`, machine);
    emitLog("system", `GPIO ${msg.pin} \u2192 ${level ? "HIGH" : "LOW"} (${machine})`, machine);
    const writeResult = await executeRenodeCommandSilent(cmd, machine);
    if (writeResult.status === "FAIL") {
      emitLog("system", `GPIO write failed for ${msg.pin}: ${writeResult.error}`);
      return;
    }
  }

  const readResult = await executeRenodeCommandSilent(`${portName} GetGPIOs`, machine);
  if (readResult.status === "FAIL") {
    emitLog("system", `GPIO read failed for ${msg.pin}: ${readResult.error}`);
    return;
  }

  const gpioMap = parseGpioList(readResult.return || "");
  const level = gpioMap.has(parsed.pin) ? gpioMap.get(parsed.pin) : null;
  emit({ type: "pin_state", machine, pin: msg.pin, level, ts: Date.now() });
}

async function handleGpioScanRequest(msg) {
  if (!renodeReady) {
    return;
  }

  const requestedPins = Array.isArray(msg.pins) ? msg.pins : [];
  const machine = resolveMachine(msg.machine);
  if (!requestedPins.length) {
    return;
  }

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
      emitLog("system", `GPIO scan failed for port ${port}: ${result.error}`);
      continue;
    }

    const gpioMap = parseGpioList(result.return || "");
    for (const item of pins) {
      const level = gpioMap.has(item.pin) ? gpioMap.get(item.pin) : null;
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

async function startUartStreaming(machine = DEFAULT_MACHINE) {
  const targetMachine = resolveMachine(machine);
  let testerReady = false;
  for (let i = 0; i < 20 && renodeRunning && renodeReady; i += 1) {
    try {
      const createResult = await callXmlRpc("CreateTerminalTester", ["sysbus.usart3", "", targetMachine]);
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
    emitLog("system", `UART streaming enabled on sysbus.usart3 (${targetMachine}, tester ${testerId})`, targetMachine);
  } else {
    emitLog("system", `UART streaming enabled on sysbus.usart3 (${targetMachine})`, targetMachine);
  }
}

async function drainUartLines(machine = DEFAULT_MACHINE, maxLines = 2, timeoutSeconds = "0.05") {
  const targetMachine = resolveMachine(machine);
  if (!uartTesterReadyByMachine.get(targetMachine) || !renodeReady || !renodeRunning) {
    return;
  }

  await executeRenodeCommandSilent("version", targetMachine).catch(() => {});

  for (let i = 0; i < maxLines; i += 1) {
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

        if (res.error && !expectedNoLine && !/no testers available/i.test(res.error)) {
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
  }, 400);
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
      const createResult = await callXmlRpc("CreateTerminalTester", ["sysbus.usart2", "", targetMachine]);
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
  emitLog("system", `Hub streaming enabled on sysbus.usart2 (${targetMachine})`, targetMachine);
}

async function drainHubLines(machine = DEFAULT_MACHINE, maxLines = 4, timeoutSeconds = "0.05") {
  const targetMachine = resolveMachine(machine);
  if (!hubTesterReadyByMachine.get(targetMachine) || !renodeReady || !renodeRunning) return;
  for (let i = 0; i < maxLines; i += 1) {
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
  }, 400);
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
const GPIO_PUSH_PORTS = {
  A: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  B: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  D: [12, 13, 14, 15],
};

let _gpioPrevState = {}; // key: `${machine}:P${port}${pin}` -> level
const gpioScanTimers = new Map();

async function pushGpioState(machine) {
  if (!renodeReady || !renodeRunning) return;
  for (const [port, pins] of Object.entries(GPIO_PUSH_PORTS)) {
    let result;
    try {
      result = await executeRenodeCommandSilent(`sysbus.gpioPort${port} GetGPIOs`, machine);
    } catch { return; }
    if (!result || result.status === "FAIL") continue;
    const gpioMap = parseGpioList(result.return || "");
    for (const pinNum of pins) {
      const level = gpioMap.has(pinNum) ? gpioMap.get(pinNum) : null;
      const key = `${machine}:P${port}${pinNum}`;
      if (_gpioPrevState[key] !== level) {
        _gpioPrevState[key] = level;
        emit({ type: "pin_state", machine, pin: `P${port}${pinNum}`, level, ts: Date.now() });
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
    emitLog("system", `Loading script: ${simScriptPosix}`);
    const includeResult = await executeRenodeScript(simScriptPosix);
    if (includeResult.status === "FAIL") {
      emitLog("system", `Include warning: ${includeResult.error || "unknown include failure"}`);
    }

    renodeRunning = true;
    renodeReady = true;
    emit({ type: "status", running: true, ts: Date.now() });

    for (const machine of MACHINES) {
      await startUartStreaming(machine);
      await drainUartLines(machine, 10, "0.05");
      startUartDrainLoop(machine);
      await startHubStreaming(machine);
      startHubDrainLoop(machine);
      startGpioPushLoop(machine);
    }
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
      for (const machine of MACHINES) {
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
    emitLog("system", "Renode is not running or not ready yet. Start simulator first.");
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
  ws.send(JSON.stringify({ type: "hello", running: renodeRunning, ts: Date.now() }));
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

      if (msg.type === "command" && typeof msg.command === "string") {
        sendMonitorCommand(msg.command, resolveMachine(msg.machine));
        return;
      }

      if (msg.type === "analog" && typeof msg.pin === "string" && typeof msg.voltage === "number") {
        const machine = resolveMachine(msg.machine);
        const v = Math.max(0, Math.min(3.3, msg.voltage)).toFixed(3);
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
