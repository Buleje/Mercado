#!/usr/bin/env node
/**
 * medir-paralelismo.mjs — cuántos tool-calls salen por mensaje.
 *
 * Por qué existe: el repo manda paralelismo por defecto (CLAUDE.md §9.1,
 * regla `agentic-style`) y una regla que nadie mide no se cumple. El censo del
 * 19-09 dio «1,00» porque contaba líneas (ver `censar`); recontado el 23-09:
 * 1,20 por mensaje, 11,9 % con 2+ llamadas, 1,64 subagentes por tanda.
 *
 * El wall-clock de una sesión ≈ número de TANDAS, no número de llamadas: tres
 * llamadas independientes en un mensaje cuestan una espera, no tres.
 *
 * Uso:
 *   node scripts/medir-paralelismo.mjs            # última sesión cerrada
 *   node scripts/medir-paralelismo.mjs --todas    # histórico completo
 *   node scripts/medir-paralelismo.mjs --json     # una línea para el hook
 *   node scripts/medir-paralelismo.mjs --subagentes  # por tipo de subagente (histórico)
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const DIR = "/home/usuario/.claude/projects/-home-usuario-proyectos-Mercado";
const META = 1.5; // tool-calls por mensaje: por debajo, se está serializando trabajo paralelizable

// OJO (corregido 2026-09-23): Claude Code escribe CADA bloque `tool_use` de un
// mensaje como una línea aparte del transcript, todas con el mismo
// `message.id`. Contar por línea daba siempre 1,00 — el «1,00 en 14.044
// mensajes» del censo del 19-09 era el artefacto, no la conducta. La tanda es
// el `message.id`; la línea sólo cuenta como tanda si no trae id.
function censar(archivos) {
  let llamadas = 0;
  const porTanda = new Map(); // clave de tanda → { n, ag }
  for (const f of archivos) {
    let texto;
    try { texto = readFileSync(f, "utf8"); } catch { continue; }
    let linea = 0;
    for (const l of texto.split("\n")) {
      linea++;
      if (!l.includes('"tool_use"')) continue;
      let e;
      try { e = JSON.parse(l); } catch { continue; }
      if (e.type !== "assistant" || !Array.isArray(e.message?.content)) continue;
      const usos = e.message.content.filter((x) => x.type === "tool_use");
      if (!usos.length) continue;
      const clave = `${f}\0${e.message.id ?? `linea-${linea}`}`;
      const t = porTanda.get(clave) ?? { n: 0, ag: 0 };
      t.n += usos.length;
      t.ag += usos.filter((x) => x.name === "Agent").length;
      porTanda.set(clave, t);
      llamadas += usos.length;
    }
  }
  let multi = 0, tandasAgente = 0, agentes = 0;
  for (const t of porTanda.values()) {
    if (t.n > 1) multi++;
    if (t.ag) { tandasAgente++; agentes += t.ag; }
  }
  const mensajes = porTanda.size;
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

// Los subagentes guardan su transcript en <sesión>/subagents/agent-*.jsonl y
// su tipo en el .meta.json de al lado. Medido el 23-09: frontend 1,23,
// backend 1,14, tester 1,12 — los que más trabajan son los que menos agrupan.
if (args.includes("--subagentes")) {
  const porTipo = new Map();
  for (const ses of readdirSync(DIR, { withFileTypes: true })) {
    if (!ses.isDirectory()) continue;
    const sub = join(DIR, ses.name, "subagents");
    let archivos = [];
    try { archivos = readdirSync(sub).filter((x) => x.endsWith(".jsonl")); } catch { continue; }
    for (const a of archivos) {
      let tipo = "?";
      try { tipo = JSON.parse(readFileSync(join(sub, a.replace(/\.jsonl$/, ".meta.json")), "utf8")).agentType ?? "?"; } catch { /* sin meta */ }
      const lista = porTipo.get(tipo) ?? [];
      lista.push(join(sub, a));
      porTipo.set(tipo, lista);
    }
  }
  const filas = [...porTipo].map(([tipo, fs]) => ({ tipo, ...censar(fs) })).filter((r) => r.mensajes >= 50);
  filas.sort((a, b) => b.llamadas - a.llamadas);
  console.log("Paralelismo por tipo de subagente (≥50 tandas)");
  for (const r of filas) {
    console.log(`  ${r.tipo.padEnd(20)} ${r.ratio.toFixed(2)} llamadas/tanda · ${r.pctMulti.toFixed(1)}% con 2+ · ${r.mensajes} tandas`);
  }
  process.exit(0);
}

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
