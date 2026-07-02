#!/usr/bin/env node
/**
 * post-edit-dispatcher.mjs — PostToolUse (async, matcher: Edit|Write|MultiEdit).
 *
 * Reemplaza 5 entradas de hook por 1: lee stdin UNA vez, aplica el gate de
 * path de cada hook hijo, y spawnea SOLO los que matchean (detached, payload
 * por stdin del hijo). Antes: 5 spawns de node por CADA edit; ahora: 1 + los
 * que correspondan (edit backend típico = 2, edit docs = 2, edit UI = 3-4).
 *
 * Los gates son SUPERSETS de los filtros internos de cada hook (ver cada
 * .mjs) y los hijos conservan su propio filtro como red: un falso positivo
 * cuesta 1 spawn con early-exit; un falso negativo no ocurre si el gate es
 * superset. Si se agrega un hook post-edit nuevo, sumarlo a CHILDREN acá.
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HOOKS_DIR = dirname(fileURLToPath(import.meta.url));

function readStdinSync() {
  // Mismo retry anti-EAGAIN que auto-learn.mjs (WSL + ráfagas de edits).
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      return readFileSync(process.stdin.fd, "utf8");
    } catch (err) {
      if (err?.code !== "EAGAIN") throw err;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
    }
  }
  return "";
}

const raw = readStdinSync();
let event = {};
try {
  event = JSON.parse(raw);
} catch {
  process.exit(0);
}

const tool = event.tool_name || "";
if (!["Edit", "Write", "MultiEdit"].includes(tool)) process.exit(0);
const fp = (event.tool_input?.file_path || event.tool_input?.path || "").replace(/\\/g, "/");
if (!fp) process.exit(0);

const CHILDREN = [
  {
    // hex-code-guard: Edit|Write de .ts/.tsx en components/ o app/
    script: "hex-code-guard.mjs",
    gate: () => ["Edit", "Write"].includes(tool) && /\/(components|app)\/.*\.tsx?$/.test(fp),
  },
  {
    // auto-learn: todo salvo infraestructura propia
    script: "auto-learn.mjs",
    gate: () => !fp.includes(".claude/") && !fp.includes("node_modules/"),
  },
  {
    // typography-lint: UI cliente (TRIGGER_GLOBS del hook)
    script: "post-edit-typography-lint.mjs",
    gate: () => /(^|\/)(components\/(marketplace|store)|app\/(marketplace|\(store\)))\//.test(fp),
  },
  {
    // ui-screenshot: ROUTE_RULES del hook (marketplace/admin/superadmin/globals)
    script: "post-edit-ui-screenshot.mjs",
    gate: () =>
      /(^|\/)(components\/(marketplace|admin|superadmin)|app\/(marketplace|superadmin))\//.test(fp) ||
      /app\/globals\.css$/.test(fp),
  },
  {
    // rubric-check: rubrics por capa + secrets-leak (matchea casi todo)
    script: "post-edit-rubric-check.mjs",
    gate: () => /\.(ts|tsx|js|mjs|json|sql|env|md)$/.test(fp),
  },
];

for (const c of CHILDREN) {
  let ok = true; // ante la duda (gate roto), spawnear — el hijo filtra solo
  try {
    ok = c.gate();
  } catch {
    ok = true;
  }
  if (!ok) continue;
  try {
    const child = spawn(process.execPath, [join(HOOKS_DIR, c.script)], {
      stdio: ["pipe", "ignore", "ignore"],
      detached: true,
      env: process.env,
    });
    child.stdin.write(raw);
    child.stdin.end();
    child.unref();
  } catch {
    // un hijo caído no frena a los demás; el hijo loguea sus propios errores
  }
}
// SIN process.exit() acá: mataría los writes de stdin encolados hacia los
// hijos (payload truncado/vacío). Los hijos están unref'd — el proceso sale
// solo cuando los pipes terminan de flushear.
