import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import "./components/daisy/Daisy.css";
import {
  BOARDS, ALL_TRACKED_PINS, MAX_LOG_LINES,
  buildPinMap, firmwareOutputsFor, isGpioPin,
} from "./constants";
import { DAISY_MACHINE, DAISY_INPUT_PIN, DAISY_OUTPUT_PIN, DAISY_LED_PIN, DAISY_BUTTON_PIN, DAISY_KNOB_PIN } from "./daisy-constants";
import { useWebSocket } from "./hooks/useWebSocket";
import { BoardCard } from "./components/BoardCard";
import { BreadboardPanel } from "./components/daisy/BreadboardPanel"; // eslint-disable-line no-unused-vars
import { DaisySeedBoard } from "./components/daisy/DaisySeedBoard";
import { OledDisplay } from "./components/daisy/OledDisplay";
import { LogPanel } from "./components/LogPanel";

let _logSeq = 0;

export default function App() {
  const [view, setView]                       = useState("discovery");
  const [activeScript, setActiveScript]       = useState("discovery"); // which resc is loaded
  const [selectedDaisyPin, setSelectedDaisyPin] = useState(DAISY_INPUT_PIN);
  const [simRunning, setSimRunning]           = useState(false);
  const [logs, setLogs]                       = useState([]);
  const [outputLevel, setOutputLevel]         = useState(null);  // daisy PA15
  const [inputLevel, setInputLevel]           = useState(null);  // daisy PB3
  const [ledLevel, setLedLevel]               = useState(null);  // daisy PC7
  const [oledFrame, setOledFrame]             = useState(null);
  const [daisyPinStates, setDaisyPinStates]   = useState({});
  const [pa2LedDuty, setPa2LedDuty]           = useState(0);
  const pa2SamplesRef                          = useRef([]);
  const bbModeRef                              = useRef("knob");
  const [elfFiles, setElfFiles]               = useState([]);
  const [selectedElf, setSelectedElf]         = useState("");
  const [discoveryElfs, setDiscoveryElfs]     = useState([]);
  const [selectedDiscoveryElf, setSelectedDiscoveryElf] = useState("");
  const [pcLog, setPcLog]                     = useState([]);
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

  // ── Breadboard mode: derived from selected ELF filename ─────────────────
  // "knob"   → pot + LED indicator (PA2 is firmware output)
  // "button" → tact switch         (PA2 is firmware input)
  // "oled"   → only OLED display
  // "blink"  → empty breadboard
  const bbMode = (() => {
    const name = (selectedElf || "").toLowerCase();
    if (name.includes("knob"))   return "knob";
    if (name.includes("button")) return "button";
    if (name.includes("oled"))   return "oled";
    if (name.includes("blink"))  return "blink";
    return "blink"; // default (unknown firmware = empty board)
  })();
  bbModeRef.current = bbMode;

  // ── WebSocket ──────────────────────────────────────────────────────────────

  const { socketState, send } = useWebSocket({
    onStatus: (running) => setSimRunning(running),
    onHello: (msg) => {
      if (Array.isArray(msg.elf_list)) setElfFiles(msg.elf_list);
      if (Array.isArray(msg.discovery_elf_list)) setDiscoveryElfs(msg.discovery_elf_list);
    },
    onOledFrame: (_machine, data) => setOledFrame(data),
    onPcValue: (_machine, pc) => setPcLog((prev) => [
      ...prev.slice(-199),
      { id: crypto.randomUUID(), pc, ts: Date.now() },
    ]),
    onScriptLoaded: (scenario) => {
      setActiveScript(scenario);
      setOutputLevel(null);
      setInputLevel(null);
      setLedLevel(null);
      setPcLog([]);
      setOledFrame(null);
      setLogs([]);
      setDaisyPinStates({});
      pa2SamplesRef.current = [];
      setPa2LedDuty(0);
      if (bbModeRef.current === "button") {
        // PA2 is an input in Button firmware — initialise pull-up so firmware
        // reads HIGH (not pressed) before any physical interaction.
        send({ type: "gpio", op: "write", machine: DAISY_MACHINE, pin: DAISY_BUTTON_PIN, level: true });
      } else {
        // Initialize ADC channel to 0 V so firmware reads silence at startup.
        send({ type: "analog", machine: DAISY_MACHINE, pin: DAISY_KNOB_PIN, voltage: 0 });
      }
    },
    onPinState: (machine, pin, level) => {
      if (machine === DAISY_MACHINE) {
        if (pin === DAISY_OUTPUT_PIN) setOutputLevel(level);
        if (pin === DAISY_INPUT_PIN)  setInputLevel(level);
        if (pin === DAISY_LED_PIN)    setLedLevel(level);
        setDaisyPinStates((prev) => ({ ...prev, [pin]: level }));
        // PA2 = software-PWM LED output in knob mode. Always-emitted by backend
        // (not change-filtered). Build a rolling average over the last 20 samples
        // to approximate duty cycle. Skip in button mode — PA2 is an input there.
        if (pin === DAISY_BUTTON_PIN && bbModeRef.current === "knob") {
          const w = pa2SamplesRef.current;
          w.push(level ? 1 : 0);
          if (w.length > 20) w.shift();
          const avg = w.reduce((a, b) => a + b, 0) / w.length;
          setPa2LedDuty(avg);
        }
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
  const allUartLogs = useMemo(
    () => logs.filter((e) => e.stream === "uart" || e.stream === "hub"),
    [logs]
  );
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

  function handleBreadboardDown() {
    send({ type: "gpio", op: "write", machine: DAISY_MACHINE, pin: DAISY_BUTTON_PIN, level: false });
  }

  function handleBreadboardUp() {
    send({ type: "gpio", op: "write", machine: DAISY_MACHINE, pin: DAISY_BUTTON_PIN, level: true });
  }

  function handleKnobRelease(v) {
    send({ type: "analog", machine: DAISY_MACHINE, pin: DAISY_KNOB_PIN, voltage: v * 3.3 });
  }

  function handleActivate() {
    const elf = view === "daisy" ? selectedElf : selectedDiscoveryElf;
    if (elf) {
      send({ type: "select_binary", elf, scenario: view });
    } else {
      send({ type: "load_script", scenario: view });
    }
  }

  function handleClear() {
    send({ type: "clear" });
    setLogs([]);
    setSelectedElf("");
    setSelectedDiscoveryElf("");
    setPcLog([]);
    setOledFrame(null);
    setActiveScript("none");
    setSimRunning(false);
    setOutputLevel(null);
    setInputLevel(null);
    setLedLevel(null);
    setDaisyPinStates({});
    pa2SamplesRef.current = [];
    setPa2LedDuty(0);
    setPinStatesByBoard(Object.fromEntries(BOARDS.map((b) => [b.id, buildPinMap()])));
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

  const currentElfList = view === "daisy" ? elfFiles : discoveryElfs;
  const currentElf     = view === "daisy" ? selectedElf : selectedDiscoveryElf;

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
            <div className="control-bar">
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
            {currentElfList.length > 0 && (
              <select
                className="elf-select"
                value={currentElf}
                onChange={(e) => view === "daisy"
                  ? setSelectedElf(e.target.value)
                  : setSelectedDiscoveryElf(e.target.value)
                }
                title="Select firmware binary"
              >
                <option value="" disabled>Select firmware…</option>
                {currentElfList.map((elf) => (
                  <option key={elf} value={elf}>
                    {elf.split("/").pop().replace(".elf", "")}
                  </option>
                ))}
              </select>
            )}
            <button
              className="activate-btn"
              disabled={socketState !== "connected" || (currentElfList.length > 0 && !currentElf)}
              onClick={handleActivate}
              title={currentElfList.length > 0 && !currentElf ? "Select firmware first" : `Activate ${view} scenario`}
            >Activate</button>
            <button
              className="clear-btn"
              disabled={socketState !== "connected"}
              onClick={handleClear}
              title="Clear simulation and reset state"
            >Clear</button>
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
          allUartLogs={allUartLogs}
          pcLog={pcLog}
          activeTab={activeLogTab}
          onTabChange={setActiveLogTab}
        />

        <div className="boards-panel">
          <div className={`boards-content${view !== activeScript ? " boards-inactive" : ""}`}>
            {view === "daisy" ? (
              <DaisySeedBoard
                outputLevel={outputLevel}
                ledLevel={ledLevel}
                logs={daisyUartLogs}
                onClearLogs={() => setLogs((prev) => prev.filter((e) => !(e.stream === "uart" && e.machine === DAISY_MACHINE)))}
                selectedPin={selectedDaisyPin}
                onPinSelect={setSelectedDaisyPin}
                onInjectLevel={onDaisyInjectLevel}
                onPulsePin={onDaisyPulsePin}
                oledElement={null}
                breadboardElement={<BreadboardPanel oledElement={bbMode === "oled" ? <OledDisplay frame={oledFrame} small /> : null} onDown={handleBreadboardDown} onUp={handleBreadboardUp} onKnobRelease={handleKnobRelease} ledDuty={pa2LedDuty} mode={bbMode} />}
                pinStates={daisyPinStates}
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
        </div>
      </section>
    </main>
  );
}

