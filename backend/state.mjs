import {
  INITIAL_MACHINES,
  INITIAL_UART_PERIPHERAL,
  INITIAL_HUB_PERIPHERAL,
  INITIAL_SCENARIO,
  DAISY_ELF,
} from "./config.mjs";

export const state = {
  // Renode process / connection
  renode: null,
  renodeSocket: null,
  renodeRunning: false,
  renodeReady: false,
  renodeLoading: false,
  renodeConnecting: false,
  _renodeRetryTimer: null,

  // Active scenario config (mutated on scenario switch)
  activeMachines: [...INITIAL_MACHINES],
  activeUartPeripheral: INITIAL_UART_PERIPHERAL,
  activeHubPeripheral: INITIAL_HUB_PERIPHERAL,
  activeScenario: INITIAL_SCENARIO,

  // UART / hub tester state
  uartTesterReadyByMachine: new Map(),
  uartTesterIdByMachine: new Map(),
  uartDrainTimers: new Map(),
  hubTesterReadyByMachine: new Map(),
  hubTesterIdByMachine: new Map(),
  hubDrainTimers: new Map(),

  // GPIO push loop
  gpioScanTimers: new Map(),
  _gpioPrevState: {},
  gpioWriteOverrides: {},

  // XML-RPC serial queue
  rpcQueue: Promise.resolve(),

  // Cached addresses (resolved lazily at runtime)
  _blinkIntervalMsAddr: undefined,
  _daisyAdcDmaBufAddr: undefined,

  // ELF overrides (set by env or runtime WS message)
  _daisyElfOverride: DAISY_ELF,
  _discoveryElfOverride: "",
  _esp32c3ElfOverride: "",

  // Poll loop timers
  _oledPollTimer: null,
  _pcPollTimer: null,

  // WebSocket clients and log replay buffer
  clients: new Set(),
  logBuffer: [],
};
