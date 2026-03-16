import { useEffect, useRef, useState } from "react";
import { BACKEND_WS_URL, BOARDS } from "../constants";

/**
 * Manages the WebSocket connection to the backend.
 * Callbacks are stored in refs so they never go stale across re-renders.
 *
 * @param {object} callbacks
 * @param {(running: boolean) => void} callbacks.onStatus
 * @param {(machine: string, pin: string, level: boolean|null) => void} callbacks.onPinState
 * @param {(stream: string, text: string, machine: string|null) => void} callbacks.onLog
 */
export function useWebSocket({ onStatus, onPinState, onLog }) {
  const wsRef = useRef(null);
  const cbRef = useRef({ onStatus, onPinState, onLog });
  cbRef.current = { onStatus, onPinState, onLog };

  const [socketState, setSocketState] = useState("disconnected");

  useEffect(() => {
    const ws = new WebSocket(BACKEND_WS_URL);
    wsRef.current = ws;

    ws.onopen = () => setSocketState("connected");

    ws.onclose = () => {
      setSocketState("disconnected");
      cbRef.current.onStatus(false);
    };

    ws.onerror = () => {
      // Silent by design: top status bar already reflects connectivity.
    };

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);

        if (msg.type === "hello" || msg.type === "status") {
          cbRef.current.onStatus(Boolean(msg.running));
          return;
        }

        if (msg.type === "pin_state" && typeof msg.pin === "string") {
          const level = typeof msg.level === "boolean" ? msg.level : null;
          cbRef.current.onPinState(msg.machine || BOARDS[0].id, msg.pin, level);
          return;
        }

        if (msg.type === "log") {
          cbRef.current.onLog(msg.stream || "log", msg.text || "", msg.machine || null);
        }
      } catch {
        cbRef.current.onLog("error", `Invalid JSON message: ${evt.data}`, null);
      }
    };

    return () => ws.close();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function send(payload) {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(payload));
    return true;
  }

  return { socketState, send };
}
