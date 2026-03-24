import http from "node:http";
import { state } from "../state.mjs";
import { RENODE_ROBOT_HOST, RENODE_ROBOT_PORT, DEFAULT_MACHINE } from "../config.mjs";
import { emitLog } from "./broadcast.mjs";

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
    return { status: "FAIL", output: "", return: "", line: "", error: faultMatch[1].trim() };
  }

  const get = (name) => {
    const m = xml.match(
      new RegExp(`<name>${name}<\\/name>\\s*<value>\\s*<string>([\\s\\S]*?)<\\/string>`, "i")
    );
    return m
      ? m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim()
      : "";
  };

  const getLine = () => {
    const m = xml.match(/<name>Line<\/name>\s*<value>\s*<string>([\s\S]*?)<\/string>/i);
    return m
      ? m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim()
      : "";
  };

  const getReturn = () => {
    const stringReturn = get("return");
    if (stringReturn) return stringReturn;
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

function enqueueRpc(task) {
  const next = state.rpcQueue.then(task, task);
  state.rpcQueue = next.catch(() => {});
  return next;
}

function enqueueGpioRpc(task) {
  const next = state.gpioRpcQueue.then(task, task);
  state.gpioRpcQueue = next.catch(() => {});
  return next;
}

export function callXmlRpc(keyword, args = []) {
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

export async function executeRenodeCommand(command, machine = DEFAULT_MACHINE) {
  const args = machine ? [command, machine] : [command];
  const result = await callXmlRpc("ExecuteCommand", args);
  const out = [result.output, result.return].filter(Boolean).join("\n").trim();
  if (out) emitLog("monitor", out, machine);
  if (result.status === "FAIL") emitLog("system", `Command failed: ${result.error}`);
  return result;
}

export async function executeRenodeCommandSilent(command, machine = DEFAULT_MACHINE) {
  const args = machine ? [command, machine] : [command];
  return callXmlRpc("ExecuteCommand", args);
}

/**
 * Like callXmlRpc but uses the dedicated GPIO queue so GPIO polls don't
 * block monitor commands or UART drain in the main queue.
 */
export function callXmlRpcGpio(keyword, args = []) {
  return enqueueGpioRpc(
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

export async function executeRenodeCommandSilentGpio(command, machine = DEFAULT_MACHINE) {
  const args = machine ? [command, machine] : [command];
  return callXmlRpcGpio("ExecuteCommand", args);
}

export async function executeRenodeScript(scriptPath) {
  const result = await callXmlRpc("ExecuteScript", [scriptPath]);
  const out = [result.output, result.return].filter(Boolean).join("\n").trim();
  if (out) emitLog("monitor", out);
  if (result.status === "FAIL") emitLog("system", `Script failed: ${result.error}`);
  return result;
}
