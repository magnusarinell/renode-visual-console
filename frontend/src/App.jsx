import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import "./components/daisy/Daisy.css";
import {
  BOARDS, ALL_TRACKED_PINS, MAX_LOG_LINES,
  buildPinMap, firmwareOutputsFor,
} from "./constants";
import { DAISY_MACHINE, DAISY_OUTPUT_PIN, DAISY_LED_PIN, DAISY_BUTTON_PIN, DAISY_KNOB_PIN } from "./daisy-constants";
import { ESP32C3_MACHINE, ESP32C3_LED_PIN, esp32c3ModeFromElf } from "./esp32c3-constants";
import { useWebSocket } from "./hooks/useWebSocket";
import { BoardCard } from "./components/BoardCard";
import { BreadboardPanel } from "./components/daisy/BreadboardPanel"; // eslint-disable-line no-unused-vars
import { DaisySeedBoard } from "./components/daisy/DaisySeedBoard";
import { OledDisplay } from "./components/daisy/OledDisplay";
import { Esp32C3Board } from "./components/esp32c3/Esp32C3Board";
import { LogPanel } from "./components/LogPanel";

let _logSeq = 0;

export default function App() {
  const [view, setView]                       = useState("nucleo");
  const [activeScript, setActiveScript]       = useState("none"); // which resc is loaded
  const [simRunning, setSimRunning]           = useState(false);
  const [logs, setLogs]                       = useState([]);
  const [outputLevel, setOutputLevel]         = useState(null);  // daisy PA15
  const [ledLevel, setLedLevel]               = useState(null);  // daisy PC7
  const [oledFrame, setOledFrame]             = useState(null);
  const [daisyPinStates, setDaisyPinStates]   = useState({});
  const [pa2LedDuty, setPa2LedDuty]           = useState(0);
  const pa2SamplesRef                          = useRef([]);
  const bbModeRef                              = useRef("knob");
  const [elfFiles, setElfFiles]               = useState([]);
  const [selectedElf, setSelectedElf]         = useState("");
  const [activatedElf, setActivatedElf]       = useState("");
  const [discoveryElfs, setDiscoveryElfs]     = useState([]);
  const [selectedDiscoveryElf, setSelectedDiscoveryElf] = useState("");
  const [esp32c3Elfs, setEsp32c3Elfs]         = useState([]);
  const [selectedEsp32c3Elf, setSelectedEsp32c3Elf] = useState("");
  const [esp32c3LedLevel, setEsp32c3LedLevel] = useState(null);
  const [pcLog, setPcLog]                     = useState([]);
  const [pinStatesByBoard, setPinStatesByBoard] = useState(() =>
    Object.fromEntries(BOARDS.map((b) => [b.id, buildPinMap()]))
  );
  const [activeLogTab, setActiveLogTab]       = useState("system"); // "system" | "monitor"
  const [voltageByBoard, setVoltageByBoard]   = useState(() =>
    Object.fromEntries(BOARDS.map((b) => [b.id, {}]))
  );
  const [adcReadbackByBoard, setAdcReadbackByBoard] = useState(() =>
    Object.fromEntries(BOARDS.map((b) => [b.id, {}]))
  );

  // ── Breadboard mode: derived from activated ELF filename ─────────────────
  // Only updates when the user clicks Activate, not on dropdown selection.
  // "knob"   → pot + LED indicator (PA2 is firmware output)
  // "button" → tact switch         (PA2 is firmware input)
  // "oled"   → only OLED display
  // "blink"  → empty breadboard
  const bbMode = (() => {
    const name = (activatedElf || "").toLowerCase();
    if (name.includes("knob"))   return "knob";
    if (name.includes("button")) return "button";
    if (name.includes("oled"))   return "oled";
    if (name.includes("blink"))  return "blink";
    return "blink"; // default (unknown firmware = empty board)
  })();
  bbModeRef.current = bbMode;

  const esp32c3Mode = esp32c3ModeFromElf(selectedEsp32c3Elf);

  // ── WebSocket ──────────────────────────────────────────────────────────────

  const { socketState, send } = useWebSocket({
    onStatus: (running) => setSimRunning(running),
    onHello: (msg) => {
      if (Array.isArray(msg.elf_list)) setElfFiles(msg.elf_list);
      if (Array.isArray(msg.discovery_elf_list)) setDiscoveryElfs(msg.discovery_elf_list);
      if (Array.isArray(msg.esp32c3_elf_list)) setEsp32c3Elfs(msg.esp32c3_elf_list);
    },
    onOledFrame: (_machine, data) => setOledFrame(data),
    onPcValue: (machine, pc, file, line, func) => setPcLog((prev) => [
      ...prev.slice(-199),
      { id: crypto.randomUUID(), machine, pc, file, line, func, ts: Date.now() },
    ]),
    onScriptLoaded: (scenario) => {
      setActiveScript(scenario);
      setOutputLevel(null);
      setLedLevel(null);
      setPcLog([]);
      setOledFrame(null);
      setEsp32c3LedLevel(null);
      setLogs([]);
      setDaisyPinStates({});
      pa2SamplesRef.current = [];
      setPa2LedDuty(0);
      if (scenario === "daisy") {
        if (bbModeRef.current === "button") {
          // PA2 is an input in Button firmware — initialise pull-up so firmware
          // reads HIGH (not pressed) before any physical interaction.
          send({ type: "gpio", op: "write", machine: DAISY_MACHINE, pin: DAISY_BUTTON_PIN, level: true });
        } else {
          // Initialize ADC channel to 0 V so firmware reads silence at startup.
          send({ type: "analog", machine: DAISY_MACHINE, pin: DAISY_KNOB_PIN, voltage: 0 });
        }
      }
    },
    onPinState: (machine, pin, level) => {
      if (machine === DAISY_MACHINE) {
        if (pin === DAISY_OUTPUT_PIN) setOutputLevel(level);
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
      if (machine === ESP32C3_MACHINE) {
        if (pin === ESP32C3_LED_PIN) setEsp32c3LedLevel(level);
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
    onAdcReadback: (machine, pin, voltage) => {
      setAdcReadbackByBoard((prev) => ({
        ...prev,
        [machine]: { ...(prev[machine] || {}), [pin]: voltage },
      }));
    },
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
  const esp32c3UartLogs = useMemo(
    () => logs.filter((e) => e.stream === "uart" && e.machine === ESP32C3_MACHINE),
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
    const elf =
      view === "daisy" ? selectedElf :
      view === "esp32c3" ? selectedEsp32c3Elf :
      selectedDiscoveryElf;
    if (view === "daisy") setActivatedElf(elf);
    if (elf) {
      send({ type: "select_binary", elf, scenario: view === "nucleo" ? "discovery" : view });
    } else {
      send({ type: "load_script", scenario: view === "nucleo" ? "discovery" : view });
    }
  }

  function handleClear() {
    send({ type: "clear" });
    setLogs([]);
    setSelectedElf("");
    setSelectedDiscoveryElf("");
    setSelectedEsp32c3Elf("");
    setPcLog([]);
    setOledFrame(null);
    setActiveScript("none");
    setSimRunning(false);
    setOutputLevel(null);
    setLedLevel(null);
    setEsp32c3LedLevel(null);
    setDaisyPinStates({});
    pa2SamplesRef.current = [];
    setPa2LedDuty(0);
    setPinStatesByBoard(Object.fromEntries(BOARDS.map((b) => [b.id, buildPinMap()])));
  }

  function pulseBoardButton(boardId) {
    send({ type: "action", action: "toggle_button", machine: boardId });
  }

  // ── Status label ───────────────────────────────────────────────────────────

  const currentElfList =
    view === "daisy" ? elfFiles :
    view === "esp32c3" ? esp32c3Elfs :
    discoveryElfs;
  const currentElf =
    view === "daisy" ? selectedElf :
    view === "esp32c3" ? selectedEsp32c3Elf :
    selectedDiscoveryElf;

  const statusLabel = useMemo(() => {
    if (socketState !== "connected") return "Renode: Disconnected";
    return simRunning ? "Renode: Running" : "Renode: Stopped";
  }, [socketState, simRunning]);

  // Per-board PC log entries
  const pcLogsByBoard = useMemo(
    () => Object.fromEntries(
      BOARDS.map((b) => [b.id, pcLog.filter((e) => e.machine === b.id)])
    ),
    [pcLog]
  );

  const daisyPcLogs = useMemo(
    () => pcLog.filter((e) => e.machine === DAISY_MACHINE),
    [pcLog]
  );

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
                className={`view-btn${view === "nucleo" ? " active" : ""}`}
                onClick={() => setView("nucleo")}
              >Nucleo F411RE</button>
              <button
                className={`view-btn${view === "daisy" ? " active" : ""}`}
                onClick={() => setView("daisy")}
              >Daisy Seed</button>
              <button
                className={`view-btn${view === "esp32c3" ? " active" : ""}`}
                onClick={() => setView("esp32c3")}
              >ESP32-C3</button>
            </div>
            {currentElfList.length > 0 && (
              <select
                className="elf-select"
                value={currentElf}
                onChange={(e) =>
                  view === "daisy"
                    ? setSelectedElf(e.target.value)
                    : view === "esp32c3"
                      ? setSelectedEsp32c3Elf(e.target.value)
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
              : view === "esp32c3"
                ? "ESP32-C3 DevKit-M1 \u00b7 RISC-V RV32IMAC \u00b7 UART+GPIO simulation"
                : "Nucleo F411RE \u00b7 STM32F411 \u00b7 Renode dual-board simulation"}
          </p>
        </div>
      </section>

      <section className="board-list">
        <LogPanel
          systemLogs={systemLogs}
          monitorLogs={monitorLogs}
          activeTab={activeLogTab}
          onTabChange={setActiveLogTab}
        />

        <div className="boards-panel">
          <div className={`boards-content${((view === "nucleo" ? "discovery" : view) !== activeScript || !simRunning) ? " boards-inactive" : ""}`}>
            {view === "daisy" ? (
              <DaisySeedBoard
                outputLevel={outputLevel}
                ledLevel={ledLevel}
                logs={daisyUartLogs}
                pcLogs={daisyPcLogs}
                breadboardElement={<BreadboardPanel oledElement={bbMode === "oled" ? <OledDisplay frame={oledFrame} small /> : null} onDown={handleBreadboardDown} onUp={handleBreadboardUp} onKnobRelease={handleKnobRelease} ledDuty={pa2LedDuty} mode={bbMode} />}
                pinStates={daisyPinStates}
              />
            ) : view === "esp32c3" ? (
              <Esp32C3Board
                logs={esp32c3UartLogs}
                onClearLogs={() => setLogs((prev) => prev.filter((e) => !(e.stream === "uart" && e.machine === ESP32C3_MACHINE)))}
                mode={esp32c3Mode}
                ledLevel={esp32c3LedLevel}
              />
            ) : (
              <div className="boards-tab-content">
              {BOARDS.map((board) => {
                return (
                  <div key={board.id} className="board-column-wrap">
                    <BoardCard
                      board={board}
                      pinStates={pinStatesByBoard[board.id] || buildPinMap()}
                      firmwareOutputs={firmwareOutputsFor(board.id, pinStatesByBoard)}
                      uartLogs={uartLogsByBoard[board.id] || []}
                      pcLogs={pcLogsByBoard[board.id] || []}
                      voltage={voltageByBoard[board.id] || {}}
                      onVoltageChange={(pin, v) =>
                        setVoltageByBoard((prev) => ({
                          ...prev,
                          [board.id]: { ...(prev[board.id] || {}), [pin]: v },
                        }))
                      }
                      adcReadback={adcReadbackByBoard[board.id] || {}}
                      send={send}
                      onBoardButton={() => pulseBoardButton(board.id)}
                    />
                  </div>
                );
              })}
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

