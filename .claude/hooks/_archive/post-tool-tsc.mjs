#!/usr/bin/env node
/**
 * post-tool-tsc.mjs — PostToolUse hook para Edit/Write/MultiEdit en .ts/.tsx.
 *
 * Corre `npx tsc --noEmit --incremental` con DEBOUNCE de 3s: en bursts de
 * edits rapidos solo la ULTIMA invocacion ejecuta tsc. Cada call escribe
 * su timestamp en .claude/.tsc-debounce.lock y espera 3s; si el lock
 * cambio (otra invocacion mas reciente), exit. Asi evitamos N corridas
 * de tsc pisandose cuando Claude hace 10 edits en serie.
 *
 * Es ASYNC (settings.json declara async: true) → el sleep no bloquea Claude.
 *
 * Usa cache incremental (.claude/.tsbuildinfo) → corridas subsecuentes
 * son rapidas (2-5s). Primera corrida ~30-60s.
 *
 * Si tsc encuentra errores → escribe en .claude/.tsc-errors.log con
 * timestamp del archivo que disparo la corrida ganadora.
 *
 * Complementa post-tool-lint.mjs: ESLint pega sintaxis + rules,
 * tsc pega TIPOS. Juntos cubren la mayoria de errores edit-time.
 *
 * Skipea: node_modules, .next, dist, .claude/worktrees, docs, lib/generated.
 */
import { readFileSync, appendFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve, relative, extname, dirname } from "node:path";

const TSABLE_EXT = new Set([".ts", ".tsx"]);
const SKIP_DIRS = [
  "node_modules",
  ".next",
  "dist",
  "build",
  ".claude/worktrees",
  "docs",
  ".husky",
  "coverage",
  "prisma/generated",
  "lib/generated",
  "_debug_",
];
const DEBOUNCE_MS = 3000;

function readInput() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return null;
  }
}

function shouldSkip(rel) {
  return SKIP_DIRS.some((d) => rel.startsWith(d + "/") || rel === d || rel.startsWith(d));
}

const input = readInput();
if (!input) process.exit(0);

const tool = input.tool_name;
if (!["Edit", "Write", "MultiEdit"].includes(tool)) process.exit(0);

const filePath = input.tool_input?.file_path;
if (!filePath || !TSABLE_EXT.has(extname(filePath))) process.exit(0);

const projectRoot =
  process.env.CLAUDE_PROJECT_DIR ||
  process.env.BSM_PROJECT_ROOT ||
  process.cwd();
const abs = resolve(filePath);
const rel = relative(projectRoot, abs).replace(/\\/g, "/");

if (rel.startsWith("..") || shouldSkip(rel)) process.exit(0);

const lockPath = `${projectRoot}/.claude/.tsc-debounce.lock`;
const logPath = `${projectRoot}/.claude/.tsc-errors.log`;
const tsBuildInfo = `${projectRoot}/.claude/.tsbuildinfo`;

try {
  mkdirSync(dirname(tsBuildInfo), { recursive: true });
} catch {}

// ── Debounce: claim slot, wait, verify still owner ──────────────
const myTs = String(Date.now());
try {
  writeFileSync(lockPath, myTs, "utf8");
} catch {
  process.exit(0);
}

await new Promise((r) => setTimeout(r, DEBOUNCE_MS));

let currentTs = "";
try {
  currentTs = existsSync(lockPath) ? readFileSync(lockPath, "utf8").trim() : "";
} catch {
  process.exit(0);
}

if (currentTs !== myTs) {
  // A newer Edit invocation took over → let it run tsc
  if (process.env.BSM_HOOKS_DEBUG === "1") {
    process.stderr.write(`⏭  post-tool-tsc: debounced (newer edit superseded ${rel})\n`);
  }
  process.exit(0);
}

// Pre-flight: mata tsc previos del MISMO proyecto que sigan vivos.
// Cierra el ciclo "3+ tsc apilados → mem-guard bloquea Edit/Bash" que se daba
// cuando varios edits llegaban con >3s de separación y los tsc previos no
// terminaban. Match estricto por tsBuildInfo para no tocar tsc de otros proyectos.
// 2026-06-02: regex anterior sobre-escapado (\\\\$&) no matcheaba el path →
// los tsc se apilaban igual (3 a la vez en el log). pkill -f con el path del
// tsBuildInfo es simple y confiable. NO se auto-mata: el proceso de este hook
// es "node post-tool-tsc.mjs", no contiene "tsc --noEmit", y aun no lanzo tsc.
try {
  execSync(
    `pkill -9 -f "tsc --noEmit --incremental --tsBuildInfoFile ${tsBuildInfo}" 2>/dev/null || true`,
    { shell: "/bin/bash", timeout: 2000, stdio: "ignore" },
  );
} catch {}

// ── Run tsc ─────────────────────────────────────────────────────
try {
  execSync(
    `npx --no tsc --noEmit --incremental --tsBuildInfoFile "${tsBuildInfo}"`,
    {
      cwd: projectRoot,
      stdio: ["ignore", "ignore", "pipe"],
      timeout: 300_000,
      env: {
        ...process.env,
        // 2026-04-28: bajado de 12288→4096. WSL tope 10GB; con next-server (3GB)
        // + MCPs (2GB) + claude, 12GB causaba OOM kill y reinicio del terminal.
        NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --max-old-space-size=4096`.trim(),
      },
    },
  );

  if (process.env.BSM_HOOKS_DEBUG === "1") {
    process.stderr.write(`✅ post-tool-tsc: project clean after ${rel}\n`);
  }
} catch (err) {
  const stderr = (err.stderr?.toString?.() ?? "").trim();
  const errors = stderr
    .split("\n")
    .filter((l) => l.includes("error TS"))
    .slice(0, 20);

  if (errors.length === 0) process.exit(0);

  const stamp = new Date().toISOString();
  const summary = `[${stamp}] tsc FAILED after edit to ${rel} — ${errors.length} error(s):\n${errors.join("\n")}\n\n`;

  try {
    appendFileSync(logPath, summary);
  } catch {}

  process.stderr.write(
    `⚠️  post-tool-tsc: ${errors.length} type error(s) after ${rel}. See .claude/.tsc-errors.log\n`,
  );
}

process.exit(0);
