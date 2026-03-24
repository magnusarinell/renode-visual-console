import { state } from "../state.mjs";
import { DEFAULT_MACHINE, simScriptPosix } from "../config.mjs";
import { emitLog } from "./broadcast.mjs";
import { callXmlRpc, executeRenodeScript } from "./rpc.mjs";
import { sleep, resolveMachine } from "./utils.mjs";

export async function startUartStreaming(machine = DEFAULT_MACHINE) {
  const targetMachine = resolveMachine(machine);
  let testerReady = false;
  for (let i = 0; i < 20 && state.renodeRunning && state.renodeReady; i += 1) {
    try {
      const createResult = await callXmlRpc("CreateTerminalTester", [
        state.activeUartPeripheral, "", targetMachine,
      ]);
      if (createResult.status === "PASS") {
        const idSource = [createResult.return, createResult.output, createResult.line]
          .filter(Boolean).join(" ");
        const idMatch = idSource.match(/\b\d+\b/);
        if (idMatch) state.uartTesterIdByMachine.set(targetMachine, idMatch[0]);
        testerReady = true;
        break;
      }
      if (createResult.error && /no machine/i.test(createResult.error) && i === 3) {
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

  state.uartTesterReadyByMachine.set(targetMachine, true);
  const testerId = state.uartTesterIdByMachine.get(targetMachine);
  if (testerId) {
    emitLog("system", `UART streaming enabled on ${state.activeUartPeripheral} (${targetMachine}, tester ${testerId})`, targetMachine);
  } else {
    emitLog("system", `UART streaming enabled on ${state.activeUartPeripheral} (${targetMachine})`, targetMachine);
  }
}

export async function drainUartLines(machine = DEFAULT_MACHINE, maxLines = 2, timeoutSeconds) {
  if (timeoutSeconds === undefined) {
    timeoutSeconds = state.activeScenario === "daisy" ? "0.0005" : "0.05";
  }
  const targetMachine = resolveMachine(machine);
  if (!state.activeMachines.includes(machine) && !state.activeMachines.includes(targetMachine)) return;
  if (!state.uartTesterReadyByMachine.get(targetMachine) || !state.renodeReady || !state.renodeRunning) return;

  for (let i = 0; i < maxLines; i += 1) {
    if (!state.activeMachines.includes(machine) && !state.activeMachines.includes(targetMachine)) return;
    if (!state.uartTesterReadyByMachine.get(targetMachine) || !state.renodeReady || !state.renodeRunning) return;
    try {
      const testerId = state.uartTesterIdByMachine.get(targetMachine);
      let res = testerId
        ? await callXmlRpc("WaitForNextLineOnUart", [`timeout=${timeoutSeconds}`, `testerId=${testerId}`])
        : await callXmlRpc("WaitForNextLineOnUart", [`timeout=${timeoutSeconds}`]);

      if (
        res.status !== "PASS" &&
        testerId &&
        res.error &&
        /more than one tester available/i.test(res.error)
      ) {
        res = await callXmlRpc("WaitForNextLineOnUart", [`testerId=${testerId}`]);
      }

      if (res.status !== "PASS") {
        if (res.error && /no testers available/i.test(res.error)) {
          state.uartTesterReadyByMachine.set(targetMachine, false);
          state.uartTesterIdByMachine.delete(targetMachine);
        }
        const expectedNoLine =
          res.error &&
          (/timeout/i.test(res.error) ||
            /Terminal tester failed/i.test(res.error) ||
            /Next line event: failure/i.test(res.error));
        if (
          res.error &&
          !expectedNoLine &&
          !/no testers available/i.test(res.error) &&
          state.activeMachines.includes(targetMachine) &&
          !state.renodeLoading
        ) {
          emitLog("system", `UART read error: ${res.error}`, targetMachine);
        }
        return;
      }

      const line = res.line || res.return;
      if (line) emitLog("uart", line, targetMachine);
    } catch (err) {
      emitLog("system", `UART read failed: ${err.message}`, targetMachine);
      return;
    }
  }
}

export function startUartDrainLoop(machine) {
  const targetMachine = resolveMachine(machine);
  if (state.uartDrainTimers.has(targetMachine)) return;
  const id = setInterval(() => drainUartLines(targetMachine).catch(() => {}), 200);
  state.uartDrainTimers.set(targetMachine, id);
}

export function stopUartDrainLoops() {
  for (const id of state.uartDrainTimers.values()) clearInterval(id);
  state.uartDrainTimers.clear();
}

export async function startHubStreaming(machine = DEFAULT_MACHINE) {
  const targetMachine = resolveMachine(machine);
  let testerReady = false;
  for (let i = 0; i < 20 && state.renodeRunning && state.renodeReady; i += 1) {
    try {
      const createResult = await callXmlRpc("CreateTerminalTester", [
        state.activeHubPeripheral, "", targetMachine,
      ]);
      if (createResult.status === "PASS") {
        const idSource = [createResult.return, createResult.output, createResult.line]
          .filter(Boolean).join(" ");
        const idMatch = idSource.match(/\b\d+\b/);
        if (idMatch) state.hubTesterIdByMachine.set(targetMachine, idMatch[0]);
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
  state.hubTesterReadyByMachine.set(targetMachine, true);
  emitLog("system", `Hub streaming enabled on ${state.activeHubPeripheral} (${targetMachine})`, targetMachine);
}

export async function drainHubLines(machine = DEFAULT_MACHINE, maxLines = 4, timeoutSeconds = "0.05") {
  const targetMachine = resolveMachine(machine);
  if (!state.activeMachines.includes(machine) && !state.activeMachines.includes(targetMachine)) return;
  if (!state.hubTesterReadyByMachine.get(targetMachine) || !state.renodeReady || !state.renodeRunning) return;
  for (let i = 0; i < maxLines; i += 1) {
    if (!state.activeMachines.includes(machine) && !state.activeMachines.includes(targetMachine)) return;
    if (!state.hubTesterReadyByMachine.get(targetMachine) || !state.renodeReady || !state.renodeRunning) return;
    try {
      const testerId = state.hubTesterIdByMachine.get(targetMachine);
      let res = testerId
        ? await callXmlRpc("WaitForNextLineOnUart", [`timeout=${timeoutSeconds}`, `testerId=${testerId}`])
        : await callXmlRpc("WaitForNextLineOnUart", [`timeout=${timeoutSeconds}`]);
      if (res.status !== "PASS") {
        if (res.error && /no testers available/i.test(res.error)) {
          state.hubTesterReadyByMachine.set(targetMachine, false);
          state.hubTesterIdByMachine.delete(targetMachine);
        }
        return;
      }
      const line = res.line || res.return;
      if (line) emitLog("hub", line, targetMachine);
    } catch {
      return;
    }
  }
}

export function startHubDrainLoop(machine) {
  const targetMachine = resolveMachine(machine);
  if (state.hubDrainTimers.has(targetMachine)) return;
  const id = setInterval(() => drainHubLines(targetMachine).catch(() => {}), 200);
  state.hubDrainTimers.set(targetMachine, id);
}

export function stopHubDrainLoops() {
  for (const id of state.hubDrainTimers.values()) clearInterval(id);
  state.hubDrainTimers.clear();
}
