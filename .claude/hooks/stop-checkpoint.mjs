#!/usr/bin/env node
/**
 * stop-checkpoint.mjs — Stop hook (async).
 *
 * Al terminar el turn de Claude, revisa si hay cambios sin commitear.
 * Si los hay, emite un warning al user y guarda un pointer en
 * .claude/.last-stop-checkpoint.json con:
 *  - timestamp
 *  - branch
 *  - files dirty
 *
 * NO bloquea. NO fuerza commit. Es una red de seguridad suave.
 * El user puede leer el último checkpoint con /bodega-context-loader quick.
 *
 * Async → no afecta latencia de respuesta.
 */
import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

const projectRoot =
  process.env.CLAUDE_PROJECT_DIR ||
  process.env.BSM_PROJECT_ROOT ||
  process.cwd();

function runGit(cmd) {
  try {
    return execSync(`git -C "${projectRoot}" ${cmd}`, {
      encoding: "utf8",
      timeout: 3_000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

const branch = runGit("branch --show-current") || "unknown";
const statusPorcelain = runGit("status --porcelain");
const lines = statusPorcelain
  ? statusPorcelain.split("\n").filter((l) => l.trim())
  : [];

if (lines.length === 0) {
  // No hay cambios pendientes — nada que hacer.
  process.exit(0);
}

// Separar staged vs unstaged vs untracked
const staged = lines.filter((l) => /^[AMDR]/.test(l)).length;
const unstaged = lines.filter((l) => /^.[MD]/.test(l)).length;
const untracked = lines.filter((l) => l.startsWith("??")).length;

const checkpoint = {
  timestamp: new Date().toISOString(),
  branch,
  staged,
  unstaged,
  untracked,
  totalDirty: lines.length,
  sample: lines.slice(0, 10),
};

try {
  const outPath = join(projectRoot, ".claude/.last-stop-checkpoint.json");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(checkpoint, null, 2), "utf8");
} catch {
  // Silent — si el write falla, no interrumpimos.
}

// Emitir aviso soft al user (systemMessage aparece como info)
const response = {
  continue: true,
  suppressOutput: false,
  systemMessage:
    `📸 stop-checkpoint: ${lines.length} archivos sin commitear en \`${branch}\` ` +
    `(staged=${staged}, unstaged=${unstaged}, untracked=${untracked}). ` +
    `Checkpoint guardado en \`.claude/.last-stop-checkpoint.json\`. ` +
    `Considerá \`/commit\` o \`/checkpoint\` antes de cerrar la sesión.`,
};

process.stdout.write(JSON.stringify(response));
process.exit(0);
