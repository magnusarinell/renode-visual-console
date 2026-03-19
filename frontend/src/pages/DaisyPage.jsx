import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import "../App.css";
import "../components/daisy/Daisy.css";
import { useWebSocket } from "../hooks/useWebSocket";
import { DaisySeedBoard } from "../components/daisy/DaisySeedBoard";
import { OledDisplay } from "../components/daisy/OledDisplay";
import { DAISY_MACHINE, DAISY_INPUT_PIN, DAISY_OUTPUT_PIN, DAISY_LED_PIN } from "../daisy-constants";

let _logSeq = 0;
const MAX_LOGS = 400;

export default function DaisyPage() {
  const [simRunning, setSimRunning]   = useState(false);
  const [outputLevel, setOutputLevel] = useState(null);  // PA15
  const [inputLevel, setInputLevel]   = useState(null);  // PB3 physical level
  const [ledLevel, setLedLevel]       = useState(null);  // PC7 onboard LED
  const [logs, setLogs]               = useState([]);
  const [oledFrame, setOledFrame]     = useState(null);  // base64 encoded framebuffer
  const [elfFiles, setElfFiles]       = useState([]);    // available ELF binaries
  const [selectedElf, setSelectedElf] = useState("");

  const { socketState, send } = useWebSocket({
    onStatus: (running) => setSimRunning(running),
    onPinState: (machine, pin, level) => {
      if (machine !== DAISY_MACHINE) return;
      if (pin === DAISY_OUTPUT_PIN) setOutputLevel(level);
      if (pin === DAISY_INPUT_PIN)  setInputLevel(level);
      if (pin === DAISY_LED_PIN)    setLedLevel(level);
    },
    onLog: (stream, text, machine) => {
      if (machine && machine !== DAISY_MACHINE) return;
      const lines = String(text)
        .replace(/\r/g, "")
        .split("\n")
        .filter(Boolean)
        .map((line) => ({
          id: crypto.randomUUID(),
          seq: ++_logSeq,
          ts: Date.now(),
          stream,
          line,
        }));
      if (lines.length) setLogs((prev) => [...prev, ...lines].slice(-MAX_LOGS));
    },
    onHello: (msg) => {
      if (Array.isArray(msg.elf_list)) setElfFiles(msg.elf_list);
    },
    onOledFrame: (_machine, data) => setOledFrame(data),
  });

  // Poll output pin state every 500 ms
  useEffect(() => {
    if (socketState !== "connected") return;
    const id = setInterval(() => {
      send({ type: "gpio", op: "read", machine: DAISY_MACHINE, pin: DAISY_OUTPUT_PIN });
    }, 500);
    return () => clearInterval(id);
  }, [socketState]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleButtonDown() {
    // PB3 is GPIO_ACTIVE_LOW — physical LOW triggers the logical "pressed" state in firmware
    send({ type: "gpio", op: "write", machine: DAISY_MACHINE, pin: DAISY_INPUT_PIN, level: false });
  }

  function handleButtonUp() {
    send({ type: "gpio", op: "write", machine: DAISY_MACHINE, pin: DAISY_INPUT_PIN, level: true });
  }

  function handleSelectElf(elf) {
    setSelectedElf(elf);
    setOledFrame(null);
    send({ type: "select_binary", elf });
  }

  const statusLabel = useMemo(() => {
    if (socketState !== "connected") return "Renode: Disconnected";
    return simRunning ? "Renode: Running" : "Renode: Stopped";
  }, [socketState, simRunning]);

  const uartLogs = useMemo(
    () => logs.filter((e) => e.stream === "uart" || e.stream === "system"),
    [logs]
  );

  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <p className="kicker">Renode Visual Console</p>
          <h1>Daisy Seed</h1>
          <p className="subtitle">Electrosmith Daisy Seed · STM32H750IBK6 · Cortex-M7</p>
        </div>
        <div className="pill-row">
          <span className={`pill ${simRunning ? "ok" : "warn"}`}>{statusLabel}</span>
          {elfFiles.length > 0 && (
            <select
              className="daisy-elf-select"
              value={selectedElf}
              onChange={(e) => handleSelectElf(e.target.value)}
              disabled={!simRunning}
              title="Select firmware binary to load"
            >
              <option value="" disabled>Select firmware…</option>
              {elfFiles.map((elf) => (
                <option key={elf} value={elf}>
                  {elf.split("/").pop().replace(".elf", "")}
                </option>
              ))}
            </select>
          )}
          <Link to="/" className="pill nav-pill">← Discovery Boards</Link>
        </div>
      </section>

      <section className="daisy-layout">
        <DaisySeedBoard
          outputLevel={outputLevel}
          inputLevel={inputLevel}
          ledLevel={ledLevel}
          onButtonDown={handleButtonDown}
          onButtonUp={handleButtonUp}
          oledElement={<OledDisplay frame={oledFrame} />}
        />

        <aside className="daisy-log-panel">
          <header className="daisy-log-header">
            <span>USART1 · Debug log</span>
            <button className="uart-filter-btn clear" onClick={() => setLogs([])}>Clear</button>
          </header>
          <div className="daisy-log-lines">
            {uartLogs.length === 0 && <div className="empty-hint">No data yet.</div>}
            {[...uartLogs].reverse().map((entry) => {
              const t  = new Date(entry.ts);
              const ts = `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}:${String(t.getSeconds()).padStart(2, "0")}.${String(t.getMilliseconds()).padStart(3, "0")}`;
              return (
                <div className="log-line daisy-log-line" key={entry.id}>
                  <span className="log-ts">{ts}</span>
                  <span>{entry.line}</span>
                </div>
              );
            })}
          </div>
        </aside>
      </section>
    </main>
  );
}
