import { state } from "../state.mjs";
import { LOG_BUFFER_MAX } from "../config.mjs";

export function emit(payload) {
  const message = JSON.stringify(payload);
  for (const client of state.clients) {
    if (client.readyState === 1) client.send(message);
  }
}

export function emitLog(stream, text, machine = null) {
  const payload = { type: "log", stream, text, machine, ts: Date.now() };
  state.logBuffer.push(payload);
  if (state.logBuffer.length > LOG_BUFFER_MAX) state.logBuffer.shift();
  emit(payload);
  if (text.includes("LED ON"))  emit({ type: "state", led: "on",  ts: Date.now() });
  if (text.includes("LED OFF")) emit({ type: "state", led: "off", ts: Date.now() });
}
