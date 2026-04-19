#!/usr/bin/env node
/**
 * post-tool-tsc.mjs — PostToolUse hook para Edit/Write/MultiEdit en archivos .ts/.tsx.
 *
 * Corre `npx tsc --noEmit --incremental` SOBRE TODO EL PROYECTO después de
 * cada edit. Usa caché incremental (`.claude/.tsbuildinfo`) así la segunda
 * corrida es rápida (2-5s). La primera tarda más (~30-60s) pero corre async
 * y no bloquea la respuesta de Claude.
 *
 * Si tsc encuentra errores, los escribe en `.claude/.tsc-errors.log` con
 * timestamp del archivo editado que disparó la corrida. Así quien mire el
 * log sabe exactamente qué edit generó los errores. No bloquea el edit —
 * solo deja una pista para que Claude (o un humano) lo vea en la próxima
 * iteración.
 *
 * Es ASYNC (settings.json lo declara con async: true) → no bloquea.
 *
 * Complementa a post-tool-lint.mjs: ESLint pega sintaxis + rules,
 * tsc pega TIPOS (lo que ESLint no ve). Juntos cubren la mayoría de
 * errores que se escapan al edit-time.
 *
 * Skipea: node_modules, .next, dist, .claude/worktrees, docs, lib/generated.
 */
import { readFileSync, appendFileSync, mkdirSync } from "node:fs";
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

const logPath = `${projectRoot}/.claude/.tsc-errors.log`;
const tsBuildInfo = `${projectRoot}/.claude/.tsbuildinfo`;

try {
  mkdirSync(dirname(tsBuildInfo), { recursive: true });
} catch {}

try {
  execSync(
    `npx --no tsc --noEmit --incremental --tsBuildInfoFile "${tsBuildInfo}"`,
    {
      cwd: projectRoot,
      stdio: ["ignore", "ignore", "pipe"],
      timeout: 120_000,
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
