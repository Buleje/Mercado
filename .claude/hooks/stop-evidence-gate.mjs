#!/usr/bin/env node
/**
 * stop-evidence-gate.mjs — Stop hook DETERMINISTA (reemplaza al hook `agent`).
 *
 * La regla #1 de Brandon: no se reporta «listo» sin evidencia ejecutable. Antes
 * la aplicaba un hook de tipo `agent`: una llamada al modelo por CADA turno,
 * que leía 20 KB de transcript para casi siempre aprobar (5-15 s de latencia y
 * tokens en cada respuesta, decenas de veces por sesión). Medido 2026-09-03.
 *
 * Esto hace lo mismo sin modelo, en ~50 ms, mirando el turno actual del
 * transcript (desde el último mensaje real del usuario):
 *   edits     = Edit/Write/MultiEdit/NotebookEdit sobre archivos del repo
 *               (los de memoria/handoff no cuentan: no son código)
 *   evidencia = Bash con tsc/tsgo/lint/vitest/build/curl/playwright/etc.,
 *               o cualquier tool del MCP de Playwright (navegador real)
 *   claim     = el último texto del asistente afirma que algo quedó listo
 *
 * Bloquea SÓLO si `edits > 0 && claim && evidencia == 0`. Todo lo demás pasa.
 * `stop_hook_active` (ya se bloqueó una vez este turno) → pasa siempre, para
 * no entrar en loop. Cada veredicto queda en `.claude/metrics/stop-gate.jsonl`
 * para poder afinar los patrones con datos y no con opiniones.
 *
 * Dry-run sobre un transcript (simula el gate en cada turno):
 *   node stop-evidence-gate.mjs --dry <transcript.jsonl>
 */

import { readFileSync, appendFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HOOKS_DIR = dirname(fileURLToPath(import.meta.url));
const METRICS = join(HOOKS_DIR, "..", "metrics", "stop-gate.jsonl");

const EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit", "mcp__lsmcp__replace_range", "mcp__lsmcp__replace_regex"]);
/** Archivos que se editan sin que eso sea «código que hay que verificar». */
const NO_ES_CODIGO = /(\/\.claude\/projects\/[^/]+\/memory\/|SESSION_HANDOFF\.md$|\/\.claude\/improvement-radar\.md$|\/scratchpad\/|^\/tmp\/)/;
/** Comandos que prueban algo de verdad. */
const EVIDENCIA_BASH =
  /\b(tsc|tsgo|eslint|oxlint|vitest|jest|playwright|next build|prisma (validate|migrate)|build-gate|visual-verify|lint-design-tokens|curl|wget|node -e|node scripts\/|python3? [^|]*test|npm (run )?(test|build|lint|typecheck)|npx (tsc|tsgo|eslint|vitest|playwright)|git diff --stat|pgrep|systemctl|free -m|JSON\.parse)\b/;
const EVIDENCIA_MCP = /^mcp__playwright__/;
/**
 * Ediciones hechas DESDE Bash (sed -i, heredoc a un archivo, python que
 * escribe, git mv). En modo bypass el harness pide usar Bash para editar, así
 * que sin esto un turno entero de cambios reales contaría como «0 edits».
 */
const EDIT_BASH = /(\bsed -i\b|\bperl -i\b|\btee\b|\bgit (mv|rm)\b|\bpython3? - ?<<|>\s*["']?[\w./-]+\.(ts|tsx|js|mjs|cjs|json|md|css|prisma|sql|sh|yml|yaml)\b)/;
/** Lo que suena a «quedó hecho». Sólo sobre el ÚLTIMO texto del asistente. */
const CLAIM =
  /\b(listo|hecho|funciona|anda|arreglad[oa]s?|resuelt[oa]s?|verificad[oa]s?|implementad[oa]s?|corregid[oa]s?|aplicad[oa]s?|qued[óo] (listo|hecho|bien|resuelto|verificado)|ya (está|anda|funciona|quedó)|todo verde|gates? en verde|done|fixed|works|implemented|verified)\b/i;

function leerStdin() {
  try {
    return JSON.parse(readFileSync(0, "utf8") || "{}");
  } catch {
    return {};
  }
}

function leerTranscript(path) {
  const out = [];
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return out;
  }
  for (const l of raw.split("\n")) {
    if (!l) continue;
    try {
      out.push(JSON.parse(l));
    } catch {
      /* línea partida: el transcript se escribe mientras se lee */
    }
  }
  return out;
}

/** Mensaje REAL del usuario (no un tool_result devuelto por el harness). */
function esUsuarioReal(j) {
  if (j.type !== "user" || j.isSidechain) return false;
  const c = j.message?.content;
  if (typeof c === "string") return c.trim().length > 0;
  if (!Array.isArray(c)) return false;
  return !c.some((b) => b.type === "tool_result") && c.some((b) => b.type === "text");
}

/** Evalúa el turno que va de `desde` hasta `hasta` (exclusivo). */
function evaluarTurno(lineas, desde, hasta) {
  let edits = 0;
  let evidencia = 0;
  let ultimoTexto = "";
  const archivos = new Set();
  for (let i = desde; i < hasta; i++) {
    const j = lineas[i];
    if (j.type !== "assistant" || j.isSidechain) continue;
    for (const b of j.message?.content ?? []) {
      if (b.type === "text" && b.text?.trim()) ultimoTexto = b.text;
      if (b.type !== "tool_use") continue;
      const name = b.name ?? "";
      const inp = b.input ?? {};
      if (EDIT_TOOLS.has(name)) {
        const fp = String(inp.file_path ?? inp.notebook_path ?? inp.filePath ?? "");
        if (!NO_ES_CODIGO.test(fp)) {
          edits++;
          archivos.add(fp.replace(/^.*\/proyectos\/Mercado\//, ""));
        }
        continue;
      }
      if (EVIDENCIA_MCP.test(name)) {
        evidencia++;
        continue;
      }
      if (name === "Bash") {
        const cmd = String(inp.command ?? "");
        if (EVIDENCIA_BASH.test(cmd)) evidencia++;
        /* Una edición por Bash cuenta como edición, salvo que apunte a lo que
           no es código (memoria, scratchpad, /tmp). */
        if (EDIT_BASH.test(cmd) && !NO_ES_CODIGO.test(cmd)) {
          edits++;
          archivos.add("(vía Bash)");
        }
      }
    }
  }
  const claim = CLAIM.test(ultimoTexto);
  return { edits, evidencia, claim, archivos: [...archivos].slice(0, 6), bloquear: edits > 0 && claim && evidencia === 0 };
}

/** Índice del último mensaje real del usuario; -1 si no hay. */
function ultimoUsuario(lineas) {
  for (let i = lineas.length - 1; i >= 0; i--) if (esUsuarioReal(lineas[i])) return i;
  return -1;
}

function registrar(fila) {
  try {
    mkdirSync(dirname(METRICS), { recursive: true });
    appendFileSync(METRICS, JSON.stringify({ ts: new Date().toISOString(), ...fila }) + "\n");
  } catch {
    /* la telemetría nunca frena el gate */
  }
}

function razon(v) {
  const lista = v.archivos.length ? ` (${v.archivos.join(", ")})` : "";
  return (
    `Gate de evidencia: editaste ${v.edits} archivo(s)${lista} y el último mensaje afirma que quedó listo, ` +
    `pero en este turno no corrió ningún gate. Corré lo que aplique —tsc/tsgo, lint, vitest del área, curl o ` +
    `screenshot con Playwright— y pegá la salida en el mismo mensaje antes de cerrar. Si no hay nada que ` +
    `verificar (docs, memoria), decilo explícito en vez de afirmar que funciona.`
  );
}

// ── Dry-run: simula el gate en cada turno del transcript ──────────────────
if (process.argv[2] === "--dry") {
  const lineas = leerTranscript(process.argv[3]);
  const idx = lineas.map((j, i) => (esUsuarioReal(j) ? i : -1)).filter((i) => i >= 0);
  let bloqueos = 0;
  idx.forEach((desde, k) => {
    const hasta = idx[k + 1] ?? lineas.length;
    const v = evaluarTurno(lineas, desde, hasta);
    if (v.bloquear) bloqueos++;
    const prompt = String(
      typeof lineas[desde].message.content === "string"
        ? lineas[desde].message.content
        : lineas[desde].message.content.find((b) => b.type === "text")?.text ?? "",
    )
      .replace(/\s+/g, " ")
      .slice(0, 60);
    console.log(
      `${v.bloquear ? "🛑" : "✅"} turno ${k + 1}: edits=${v.edits} evidencia=${v.evidencia} claim=${v.claim ? "sí" : "no"}  «${prompt}»`,
    );
  });
  console.log(`\n${idx.length} turnos, ${bloqueos} bloqueos`);
  process.exit(0);
}

// ── Hook real ─────────────────────────────────────────────────────────────
const input = leerStdin();
if (input.stop_hook_active) process.exit(0);

const lineas = leerTranscript(input.transcript_path ?? "");
const desde = ultimoUsuario(lineas);
if (desde < 0) process.exit(0);

const v = evaluarTurno(lineas, desde, lineas.length);
registrar({ session: input.session_id ?? null, ...v });

if (v.bloquear) {
  process.stdout.write(JSON.stringify({ decision: "block", reason: razon(v) }));
}
process.exit(0);
