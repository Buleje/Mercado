#!/usr/bin/env node
/**
 * pre-tool-mem-guard.mjs — PreToolUse hook para Edit|Write|MultiEdit|Bash.
 *
 * CIRCUIT BREAKER de recursos. Disenado para evitar el bloqueo total
 * de WSL cuando Claude trabaja autonomo > 30 min.
 *
 * Bloquea (exit 2) si:
 *   - RAM disponible < 1500 MB (por debajo, el siguiente tsc tira OOM)
 *   - >= 2 procesos `tsc` corriendo simultaneamente (apilado del post-tool-tsc)
 *   - >= 3 procesos `chromium` huerfanos (sin parent vivo)
 *   - load average 1min > 14 (sistema saturado)
 *
 * Cuando bloquea, sugiere fix:
 *   - Si RAM baja: matar chromium/MCPs zombi (auto si BSM_AUTOKILL=1)
 *   - Si load alta: esperar 30s
 *
 * Override: env BSM_SKIP_MEM_GUARD=1 (solo emergencias).
 *
 * Activado en .claude/settings.json -> PreToolUse > Edit|Write|MultiEdit|Bash.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname } from "node:path";

const MIN_FREE_MB = 500;
const MAX_TSC = 2;
const MAX_ORPHAN_CHROMIUM = 3;
const MAX_LOAD_1MIN = 14;

function readInput() {
  try { return JSON.parse(readFileSync(0, "utf8")); } catch { return null; }
}

function memInfo() {
  try {
    const meminfo = readFileSync("/proc/meminfo", "utf8");
    const grab = (k) => {
      const m = meminfo.match(new RegExp(`^${k}:\\s+(\\d+)\\s+kB`, "m"));
      return m ? Math.round(parseInt(m[1], 10) / 1024) : 0;
    };
    return {
      total: grab("MemTotal"),
      free: grab("MemFree"),
      avail: grab("MemAvailable"),
      buffers: grab("Buffers"),
      cached: grab("Cached"),
    };
  } catch { return null; }
}

function loadAvg() {
  try {
    const l = readFileSync("/proc/loadavg", "utf8").trim().split(/\s+/);
    return { l1: parseFloat(l[0]), l5: parseFloat(l[1]), l15: parseFloat(l[2]) };
  } catch { return { l1: 0, l5: 0, l15: 0 }; }
}

function countProcs(name) {
  try {
    // Fix 2026-05-20: pgrep -f auto-matches its own shell wrapper because the
    // regex pattern lives in the command line — inflating counts by +1 or +2.
    // Use ps + awk filtering instead, which doesn't self-match.
    const cmd = `ps -eo pid,cmd --no-headers | awk -v pat='${name}' 'BEGIN{c=0} $0 ~ pat && !/awk|pgrep|bash -c/ {c++} END{print c}'`;
    const out = execSync(cmd, { encoding: "utf8", timeout: 2000, shell: "/bin/bash" });
    return parseInt(out.trim() || "0", 10);
  } catch { return 0; }
}

function countOrphanChromium() {
  try {
    // ppid=1 = sin parent vivo (huerfano adoptado por init)
    const out = execSync(
      `ps -eo pid,ppid,cmd | awk '$2==1 && /chrome|chromium/ {c++} END {print c+0}'`,
      { encoding: "utf8", timeout: 2000, shell: "/bin/bash" }
    );
    return parseInt(out.trim() || "0", 10);
  } catch { return 0; }
}

function tryAutokill() {
  if (process.env.BSM_AUTOKILL !== "1") return null;
  const acts = [];
  try {
    // Mata Chromiums huerfanos (ppid=1)
    execSync(`ps -eo pid,ppid,cmd | awk '$2==1 && /chrome|chromium/ {print $1}' | xargs -r kill -9 2>/dev/null || true`,
      { shell: "/bin/bash", timeout: 3000 });
    acts.push("chromium-orphans-killed");
  } catch {}
  try {
    // Mata procesos `tsc` huerfanos
    execSync(`ps -eo pid,ppid,cmd | awk '$2==1 && /tsc/ {print $1}' | xargs -r kill -9 2>/dev/null || true`,
      { shell: "/bin/bash", timeout: 3000 });
    acts.push("tsc-orphans-killed");
  } catch {}
  return acts.length ? acts.join(",") : null;
}

const input = readInput();
if (!input) process.exit(0);

const tool = input.tool_name || "";
if (!["Edit", "Write", "MultiEdit", "Bash"].includes(tool)) process.exit(0);

if (process.env.BSM_SKIP_MEM_GUARD === "1") process.exit(0);

const mem = memInfo();
const load = loadAvg();
const tscCount = countProcs("tsc --noEmit");
const orphanChromium = countOrphanChromium();

const problems = [];
if (mem && mem.avail < MIN_FREE_MB) problems.push(`RAM libre ${mem.avail}MB < ${MIN_FREE_MB}MB`);
if (tscCount >= MAX_TSC) problems.push(`${tscCount} procs tsc apilados (max ${MAX_TSC})`);
if (orphanChromium >= MAX_ORPHAN_CHROMIUM) problems.push(`${orphanChromium} chromium huerfanos (max ${MAX_ORPHAN_CHROMIUM})`);
if (load.l1 > MAX_LOAD_1MIN) problems.push(`load 1min ${load.l1.toFixed(1)} > ${MAX_LOAD_1MIN}`);

if (problems.length === 0) {
  // Log silencioso para metricas (opcional)
  if (process.env.BSM_HOOKS_DEBUG === "1" && mem) {
    process.stderr.write(`[mem-guard] OK ${mem.avail}MB libre, load ${load.l1.toFixed(1)}, tsc=${tscCount}, chromium-orphans=${orphanChromium}\n`);
  }
  process.exit(0);
}

// Intentar autokill si esta habilitado
const killed = tryAutokill();

// Persistir el incidente
const logPath = `${process.env.CLAUDE_PROJECT_DIR || process.cwd()}/.claude/.mem-guard.log`;
try {
  mkdirSync(dirname(logPath), { recursive: true });
  const line = `[${new Date().toISOString()}] tool=${tool} blocked: ${problems.join(" | ")}${killed ? ` | autokill=${killed}` : ""}\n`;
  writeFileSync(logPath, line, { flag: "a" });
} catch {}

const msg =
  `[mem-guard] BLOQUEADO — sistema saturado:\n` +
  `  ${problems.map((p) => `- ${p}`).join("\n  ")}\n` +
  (killed ? `  Auto-killed: ${killed}\n` : `  Tip: exporta BSM_AUTOKILL=1 para que limpie automatico.\n`) +
  `  O esperá 30s y reintentá. Override: BSM_SKIP_MEM_GUARD=1.\n`;

process.stderr.write(msg);

// Exit 2 = block tool execution con stderr al modelo
process.exit(2);
