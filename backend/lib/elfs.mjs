import { readFileSync, existsSync, readdirSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { repoRoot, ADDR2LINE_BIN } from "../config.mjs";
import { state } from "../state.mjs";
import { executeRenodeCommandSilent } from "./rpc.mjs";

const execFileAsync = promisify(execFile);

export async function resolveAddr2line(pc, elfPath) {
  if (!ADDR2LINE_BIN || !elfPath || !existsSync(elfPath)) return null;
  try {
    const { stdout } = await execFileAsync(
      ADDR2LINE_BIN,
      ["-e", elfPath, "-f", "-C", "-s", pc],
      { timeout: 2000 }
    );
    const lines = stdout.trim().split("\n");
    if (lines.length >= 2) {
      const func = lines[0].trim();
      const fileLine = lines[1].trim();
      const m = fileLine.match(/^(.+):(\d+)/);
      if (m && m[2] !== "0") return { func, file: m[1], line: Number(m[2]) };
    }
  } catch { /* addr2line failed or timed out */ }
  return null;
}

export function getElfPathForScenario() {
  function resolveElf(relOrAbs) {
    const abs = path.isAbsolute(relOrAbs) ? relOrAbs : path.join(repoRoot, relOrAbs);
    return existsSync(abs) ? abs : "";
  }
  if (state.activeScenario === "daisy") {
    return resolveElf(state._daisyElfOverride || "submodules/DaisyExamples/seed/Blink/build/Blink.elf");
  }
  if (state.activeScenario === "discovery") {
    return resolveElf(state._discoveryElfOverride || "zephyr/build/zephyr/zephyr.elf");
  }
  if (state.activeScenario === "esp32c3") {
    return resolveElf(state._esp32c3ElfOverride || "");
  }
  return "";
}

export function getBlinkIntervalMsAddr() {
  if (state._blinkIntervalMsAddr !== undefined) return state._blinkIntervalMsAddr;
  const mapPath = path.join(repoRoot, "zephyr", "build", "zephyr", "zephyr.map");
  try {
    const content = readFileSync(mapPath, "utf8");
    const re = /\.data\.blink_interval_ms\s*\n\s*(0x[0-9a-fA-F]+)/;
    const m = content.match(re);
    if (m) {
      state._blinkIntervalMsAddr = parseInt(m[1], 16);
      return state._blinkIntervalMsAddr;
    }
  } catch { /* map file not present */ }
  state._blinkIntervalMsAddr = null;
  return null;
}

export async function getDaisyAdcDmaBufAddr(machine) {
  if (state._daisyAdcDmaBufAddr !== undefined) return state._daisyAdcDmaBufAddr;
  try {
    const res = await executeRenodeCommandSilent("sysbus ReadDoubleWord 0x4002004C", machine);
    const text = [res.output, res.return].filter(Boolean).join(" ").trim();
    const m = text.match(/0x([0-9a-fA-F]+)/);
    if (m) {
      const addr = parseInt(m[1], 16);
      if (addr > 0 && addr < 0xFFFFFFFF) {
        state._daisyAdcDmaBufAddr = addr;
        return state._daisyAdcDmaBufAddr;
      }
    }
  } catch { /* not ready yet */ }
  return null;
}

export function scanDaisyElfs() {
  const seedDir = path.join(repoRoot, "submodules", "DaisyExamples", "seed");
  if (!existsSync(seedDir)) return [];
  try {
    return readdirSync(seedDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .flatMap((d) => {
        const buildDir = path.join(seedDir, d.name, "build");
        if (!existsSync(buildDir)) return [];
        return readdirSync(buildDir)
          .filter((f) => f.endsWith(".elf"))
          .map((f) => `submodules/DaisyExamples/seed/${d.name}/build/${f}`);
      });
  } catch { return []; }
}

export function scanDiscoveryElfs() {
  const buildDir = path.join(repoRoot, "zephyr", "build", "zephyr");
  if (!existsSync(buildDir)) return [];
  try {
    return readdirSync(buildDir)
      .filter((f) => f === "zephyr.elf")
      .map((f) => `zephyr/build/zephyr/${f}`);
  } catch { return []; }
}

export function scanEsp32c3Elfs() {
  const elfRel = "submodules/esp-idf/examples/get-started/hello_world/build/hello_world.elf";
  return existsSync(path.join(repoRoot, elfRel)) ? [elfRel] : [];
}
