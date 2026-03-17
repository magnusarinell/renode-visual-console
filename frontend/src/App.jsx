import { useEffect, useMemo, useState } from "react";
import "./App.css";
import "./components/daisy/Daisy.css";
import {
  BOARDS, ALL_TRACKED_PINS, MAX_LOG_LINES,
  buildPinMap, firmwareOutputsFor, isGpioPin,
} from "./constants";
import { DAISY_MACHINE, DAISY_INPUT_PIN, DAISY_OUTPUT_PIN } from "./daisy-constants";
import { useWebSocket } from "./hooks/useWebSocket";
import { BoardCard } from "./components/BoardCard";
import { DaisySeedBoard } from "./components/daisy/DaisySeedBoard";
import { LogPanel } from "./components/LogPanel";

let _logSeq = 0;

export default function App() {
  const [view, setView]                       = useState("discovery");
  const [activeScript, setActiveScript]       = useState("discovery"); // which resc is loaded
  const [selectedDaisyPin, setSelectedDaisyPin] = useState("D42");     // PB3 — writable by default
  const [simRunning, setSimRunning]           = useState(false);
  const [logs, setLogs]                       = useState([]);
  const [outputLevel, setOutputLevel]         = useState(null);  // daisy PA15
  const [inputLevel, setInputLevel]           = useState(null);  // daisy PB3
  const [pinStatesByBoard, setPinStatesByBoard] = useState(() =>
    Object.fromEntries(BOARDS.map((b) => [b.id, buildPinMap()]))
  );
  const [selectedPinByBoard, setSelectedPinByBoard] = useState(() =>
    Object.fromEntries(BOARDS.map((b) => [b.id, "PA0"]))
  );
  const [activeLogTab, setActiveLogTab]       = useState("system");
  const [uartFilterByBoard, setUartFilterByBoard] = useState(() =>
    Object.fromEntries(BOARDS.map((b) => [b.id, { usart2: true, usart3: true }]))
  );
  const [analogActiveByBoard, setAnalogActiveByBoard] = useState(() =>
    Object.fromEntries(BOARDS.map((b) => [b.id, false]))
  );
  const [voltageByBoard, setVoltageByBoard]   = useState(() =>
    Object.fromEntries(BOARDS.map((b) => [b.id, {}]))
  );

  // ── WebSocket ──────────────────────────────────────────────────────────────

  const { socketState, send } = useWebSocket({
    onStatus: (running) => setSimRunning(running),
    onScriptLoaded: (scenario) => {
      setActiveScript(scenario);
      // Reset pin levels on scenario switch
      setOutputLevel(null);
      setInputLevel(null);
    },
    onPinState: (machine, pin, level) => {
      if (machine === DAISY_MACHINE) {
        if (pin === DAISY_OUTPUT_PIN) setOutputLevel(level);
        if (pin === DAISY_INPUT_PIN)  setInputLevel(level);
        return;
      }
      setPinStatesByBoard((prev) => {
        const boardPins = prev[machine] || buildPinMap();
        return {
          ...prev,
          [machine]: { ...boardPins, [pin]: { ...boardPins[pin], level } },
        };
      });
    },
    onLog: (stream, text, machine) => addLog(stream, text, machine),
  });

  // ── Fallback GPIO poll (discovery) ──────────────────────────────────────────

  useEffect(() => {
    if (socketState !== "connected") return;
    const id = setInterval(() => {
      for (const board of BOARDS) {
        send({ type: "gpio", op: "scan", machine: board.id, pins: ALL_TRACKED_PINS });
      }
    }, 2000);
    return () => clearInterval(id);
  }, [socketState]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Daisy GPIO poll ───────────────────────────────────────────────────────

  useEffect(() => {
    if (socketState !== "connected" || view !== "daisy") return;
    const id = setInterval(() => {
      send({ type: "gpio", op: "read", machine: DAISY_MACHINE, pin: DAISY_OUTPUT_PIN });
    }, 500);
    return () => clearInterval(id);
  }, [socketState, view]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived log slices ─────────────────────────────────────────────────────

  const uartLogs = useMemo(() => logs.filter((e) => e.stream === "uart"), [logs]);
  const daisyUartLogs = useMemo(
    () => logs.filter((e) => e.stream === "uart" && e.machine === DAISY_MACHINE),
    [logs]
  );
  const uartHubLogs = useMemo(() => logs.filter((e) => e.stream === "hub"), [logs]);
  const systemLogs  = useMemo(() => logs.filter((e) => e.stream === "system"), [logs]);
  const monitorLogs = useMemo(
    () => logs.filter((e) => e.stream !== "uart" && e.stream !== "system" && e.stream !== "hub"),
    [logs]
  );

  const uartLogsByBoard = useMemo(
    () => Object.fromEntries(
      BOARDS.map((b) => [b.id, uartLogs.filter((e) => (e.machine || BOARDS[0].id) === b.id)])
    ),
    [uartLogs]
  );
  const uartHubLogsByBoard = useMemo(
    () => Object.fromEntries(
      BOARDS.map((b) => [b.id, uartHubLogs.filter((e) => (e.machine || BOARDS[0].id) === b.id)])
    ),
    [uartHubLogs]
  );
  const combinedUartByBoard = useMemo(
    () => Object.fromEntries(
      BOARDS.map((b) => {
        const u3 = uartLogsByBoard[b.id]    || [];
        const u2 = uartHubLogsByBoard[b.id] || [];
        return [
          b.id,
          [...u3.map((e) => ({ ...e, src: "usart3" })), ...u2.map((e) => ({ ...e, src: "usart2" }))]
            .sort((a, x) => a.seq - x.seq),
        ];
      })
    ),
    [uartLogsByBoard, uartHubLogsByBoard]
  );

  // ── Helpers ────────────────────────────────────────────────────────────────

  function addLog(stream, text, machine = null) {
    const lines = String(text)
      .replace(/\r/g, "")
      .split("\n")
      .filter(Boolean)
      .map((line) => ({
        id: crypto.randomUUID(),
        seq: ++_logSeq,
        ts: Date.now(),
        stream,
        machine,
        line,
      }));
    if (lines.length) {
      setLogs((prev) => [...prev, ...lines].slice(-MAX_LOG_LINES));
    }
  }

  function handleButtonDown() {
    // Use pulse op so backend advances simulation time between LOW/HIGH,
    // letting firmware detect the button press within one RPC chain.
    send({ type: "gpio", op: "pulse", machine: DAISY_MACHINE, pin: DAISY_INPUT_PIN });
  }

  function handleButtonUp() {
    // No-op: pulse is self-contained (LOW + sim advance + HIGH)
  }

  function handleLoadScript(target) {
    send({ type: "load_script", scenario: target });
  }

  function onDaisyInjectLevel(stmPin, level) {
    if (stmPin === DAISY_OUTPUT_PIN) return; // PA15 is firmware output
    send({ type: "gpio", op: "write", machine: DAISY_MACHINE, pin: stmPin, level });
  }

  function onDaisyPulsePin(stmPin) {
    if (stmPin === DAISY_OUTPUT_PIN) return;
    send({ type: "gpio", op: "pulse", machine: DAISY_MACHINE, pin: stmPin });
  }

  function pulseBoardButton(boardId) {
    send({ type: "action", action: "toggle_button", machine: boardId });
    setTimeout(() => send({ type: "action", action: "toggle_button", machine: boardId }), 260);
  }

  function pulsePin(boardId, pin) {
    if (!isGpioPin(pin)) return;
    injectPinLevel(boardId, pin, true);
    setTimeout(() => injectPinLevel(boardId, pin, false), 130);
  }

  function injectPinLevel(boardId, pin, level) {
    const pinStates = pinStatesByBoard[boardId] || buildPinMap();
    if (pinStates[pin]?.role === "output") {
      addLog("system", `Pin ${pin} is controlled by firmware (output).`);
      return;
    }
    setPinStatesByBoard((prev) => ({
      ...prev,
      [boardId]: {
        ...(prev[boardId] || buildPinMap()),
        [pin]: { ...(prev[boardId]?.[pin] || {}), level },
      },
    }));
    send({ type: "gpio", op: "write", machine: boardId, pin, level });
  }

  // ── Status label ───────────────────────────────────────────────────────────

  const statusLabel = useMemo(() => {
    if (socketState !== "connected") return "Renode: Disconnected";
    return simRunning ? "Renode: Running" : "Renode: Stopped";
  }, [socketState, simRunning]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <p className="kicker">Renode Visual Console</p>
          <div className="heading-row">
            <h1>Board Visualizer</h1>
            <div className="view-toggle">
              <button
                className={`view-btn${view === "discovery" ? " active" : ""}`}
                onClick={() => setView("discovery")}
              >Discovery</button>
              <button
                className={`view-btn${view === "daisy" ? " active" : ""}`}
                onClick={() => setView("daisy")}
              >Daisy Seed</button>
            </div>
          </div>
          <p className="subtitle">
            {view === "daisy"
              ? "Electrosmith Daisy Seed \u00b7 STM32H750IBK6 \u00b7 Cortex-M7"
              : "STM32F4 Discovery Kit \u00b7 Renode dual-board simulation"}
          </p>
        </div>
        <div className="pill-row">
          <span className={`pill ${simRunning ? "ok" : "warn"}`}>{statusLabel}</span>
        </div>
      </section>

      <section className="board-list">
        <LogPanel
          systemLogs={systemLogs}
          monitorLogs={monitorLogs}
          uartHubLogs={uartHubLogs}
          daisyUartLogs={daisyUartLogs}
          activeTab={activeLogTab}
          onTabChange={setActiveLogTab}
        />

        <div className="boards-panel">
          <div className={`boards-content${view !== activeScript ? " boards-inactive" : ""}`}>
            {view === "daisy" ? (
              <DaisySeedBoard
                outputLevel={outputLevel}
                inputLevel={inputLevel}
                onButtonDown={handleButtonDown}
                onButtonUp={handleButtonUp}
                logs={daisyUartLogs}
                onClearLogs={() => setLogs((prev) => prev.filter((e) => !(e.stream === "uart" && e.machine === DAISY_MACHINE)))}
                selectedPin={selectedDaisyPin}
                onPinSelect={setSelectedDaisyPin}
                onInjectLevel={onDaisyInjectLevel}
                onPulsePin={onDaisyPulsePin}
              />
            ) : (
              <div className="boards-tab-content">
              {BOARDS.map((board) => (
                <BoardCard
                  key={board.id}
                  board={board}
                  pinStates={pinStatesByBoard[board.id] || buildPinMap()}
                  selectedPin={selectedPinByBoard[board.id] || "PA0"}
                  onPinSelect={(pin) =>
                    setSelectedPinByBoard((prev) => ({ ...prev, [board.id]: pin }))
                  }
                  firmwareOutputs={firmwareOutputsFor(board.id, pinStatesByBoard)}
                  uartFilter={uartFilterByBoard[board.id] || { usart2: true, usart3: true }}
                  onToggleFilter={(src) =>
                    setUartFilterByBoard((prev) => ({
                      ...prev,
                      [board.id]: { ...prev[board.id], [src]: !prev[board.id][src] },
                    }))
                  }
                  onClearLogs={() =>
                    setLogs((prev) =>
                      prev.filter(
                        (e) =>
                          !((e.stream === "uart" || e.stream === "hub") &&
                            (e.machine || BOARDS[0].id) === board.id)
                      )
                    )
                  }
                  combinedUartLogs={combinedUartByBoard[board.id] || []}
                  voltage={voltageByBoard[board.id] || {}}
                  onVoltageChange={(pin, v) =>
                    setVoltageByBoard((prev) => ({
                      ...prev,
                      [board.id]: { ...(prev[board.id] || {}), [pin]: v },
                    }))
                  }
                  analogActive={analogActiveByBoard[board.id] || false}
                  onToggleAnalog={() =>
                    setAnalogActiveByBoard((prev) => ({ ...prev, [board.id]: !prev[board.id] }))
                  }
                  send={send}
                  onPulsePin={(pin) => pulsePin(board.id, pin)}
                  onInjectLevel={(pin, level) => injectPinLevel(board.id, pin, level)}
                  onBoardButton={() => pulseBoardButton(board.id)}
                />
              ))}
              </div>
            )}
          </div>

          {view !== activeScript && (
            <div className="board-load-overlay">
              <div className="board-load-prompt">
                <p className="board-load-prompt-text">
                  {view === "daisy" ? "Daisy Seed" : "Discovery Dual"} not loaded in Renode
                </p>
                <button className="board-load-btn" onClick={() => handleLoadScript(view)}>
                  Load {view === "daisy" ? "Daisy Seed" : "Discovery Dual"}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

