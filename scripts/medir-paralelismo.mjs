#!/usr/bin/env node
/**
 * medir-paralelismo.mjs — cuántos tool-calls salen por mensaje.
 *
 * Por qué existe (medido 2026-09-19): el repo manda paralelismo por defecto
 * (CLAUDE.md §9.1, regla `agentic-style`, skill `turbo-parallel`), pero el
 * censo de 35 transcripts dio **1,00 tool-calls por mensaje**: 7 mensajes de
 * 14.044 llevaban más de una llamada, y los 110 subagentes salieron de a uno.
 * Una regla que nadie mide no se cumple. Esto la mide.
 *
 * El wall-clock de una sesión ≈ número de TANDAS, no número de llamadas: tres
 * llamadas independientes en un mensaje cuestan una espera, no tres.
 *
 * Uso:
 *   node scripts/medir-paralelismo.mjs            # última sesión cerrada
 *   node scripts/medir-paralelismo.mjs --todas    # histórico completo
 *   node scripts/medir-paralelismo.mjs --json     # una línea para el hook
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const DIR = "/home/usuario/.claude/projects/-home-usuario-proyectos-Mercado";
const META = 1.5; // tool-calls por mensaje: por debajo, se está serializando trabajo paralelizable

function censar(archivos) {
  let mensajes = 0, llamadas = 0, tandasAgente = 0, agentes = 0, multi = 0;
  for (const f of archivos) {
    let texto;
    try { texto = readFileSync(f, "utf8"); } catch { continue; }
    for (const l of texto.split("\n")) {
      if (!l.includes('"tool_use"')) continue;
      let e;
      try { e = JSON.parse(l); } catch { continue; }
      if (e.type !== "assistant" || !Array.isArray(e.message?.content)) continue;
      const usos = e.message.content.filter((x) => x.type === "tool_use");
      if (!usos.length) continue;
      mensajes++; llamadas += usos.length;
      if (usos.length > 1) multi++;
      const ag = usos.filter((x) => x.name === "Agent").length;
      if (ag) { tandasAgente++; agentes += ag; }
    }
  }
  return {
    mensajes, llamadas, multi, agentes, tandasAgente,
    ratio: mensajes ? llamadas / mensajes : 0,
    ratioAgente: tandasAgente ? agentes / tandasAgente : 0,
    pctMulti: mensajes ? (multi / mensajes) * 100 : 0,
  };
}

function transcripts() {
  try {
    return readdirSync(DIR)
      .filter((x) => x.endsWith(".jsonl"))
      .map((x) => ({ p: join(DIR, x), t: statSync(join(DIR, x)).mtimeMs, s: statSync(join(DIR, x)).size }))
      .sort((a, b) => b.t - a.t);
  } catch { return []; }
}

const args = process.argv.slice(2);
const todos = transcripts();
if (!todos.length) {
  if (args.includes("--json")) console.log("{}");
  else console.log("sin transcripts");
  process.exit(0);
}

// La sesión actual es la más reciente y sigue escribiéndose: para el resumen de
// arranque interesa la ANTERIOR, que ya está cerrada.
const elegidos = args.includes("--todas")
  ? todos.map((x) => x.p)
  : todos.filter((x) => x.s > 2000).slice(1, 2).map((x) => x.p);

const r = censar(elegidos.length ? elegidos : [todos[0].p]);

if (args.includes("--json")) {
  console.log(JSON.stringify({ ratio: +r.ratio.toFixed(2), pctMulti: +r.pctMulti.toFixed(1), llamadas: r.llamadas, agentes: r.agentes, ratioAgente: +r.ratioAgente.toFixed(2), meta: META }));
  process.exit(0);
}

const veredicto = r.ratio >= META ? "✅ en meta" : `⚠️ por debajo de la meta (${META})`;
console.log(`Paralelismo — ${elegidos.length} transcript(s)`);
console.log(`  tool-calls por mensaje : ${r.ratio.toFixed(2)}  ${veredicto}`);
console.log(`  mensajes con 2+ calls  : ${r.pctMulti.toFixed(1)}%  (${r.multi} de ${r.mensajes})`);
console.log(`  subagentes por tanda   : ${r.ratioAgente.toFixed(2)}  (${r.agentes} en ${r.tandasAgente} tandas)`);
console.log(`  total                  : ${r.llamadas} llamadas`);
if (r.ratio < META) {
  console.log(`\n  Cada tanda = una espera completa del modelo. ${r.llamadas} llamadas en`);
  console.log(`  ${r.mensajes} tandas podrían ser ~${Math.ceil(r.llamadas / META)} si lo independiente viajara junto.`);
}
