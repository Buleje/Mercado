#!/usr/bin/env node
/**
 * medir-economia.mjs — cuánto trabajo repetido hacen las sesiones (2026-10-02).
 *
 * Lee los transcripts del proyecto (hilo principal + subagentes) y mide lo que
 * la tabla «Economía» de .claude/rules/agentic-style.md intenta bajar: turnos y
 * contexto por subagente, capturas leídas, gates a mano y gates justo antes de
 * un commit que los repite. Para comparar contra la base del 02-10:
 *
 *   node scripts/medir-economia.mjs --desde 2026-10-03 --comparar .claude/economia-baseline-2026-10-02.json
 *   node scripts/medir-economia.mjs --hasta 2026-10-02 --ultimas 40 --guardar .claude/economia-baseline-2026-10-02.json
 */
import { readFileSync, readdirSync, existsSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const DIR = join(homedir(), ".claude/projects/-home-usuario-proyectos-Mercado");
const desde = arg("desde") ? new Date(arg("desde")).getTime() : 0;
const hasta = arg("hasta") ? new Date(arg("hasta")).getTime() + 86_400_000 : Infinity;
const ultimas = Number(arg("ultimas", 40));

const ordenadas = readdirSync(DIR)
  .filter((f) => f.endsWith(".jsonl"))
  .map((f) => ({ f: join(DIR, f), t: statSync(join(DIR, f)).mtimeMs, s: statSync(join(DIR, f)).size }))
  .filter((x) => x.t >= desde && x.t < hasta)
  .sort((a, b) => b.t - a.t);
/* --anterior (lo usa el arranque de sesión): la sesión actual es la más reciente y
   sigue escribiéndose; interesa la ANTERIOR, ya cerrada (igual que medir-paralelismo). */
const principales = (process.argv.includes("--anterior") ? ordenadas.filter((x) => x.s > 2000).slice(1, 2) : ordenadas.slice(0, ultimas)).map((x) => x.f);

const GATE = { tsc: /npm run typecheck|tsc7|npx tsc|tsgo/, lint: /npm run lint\b|npx eslint|oxlint/, vitest: /vitest|npm (run )?test\b/ };
const lineas = (f) =>
  readFileSync(f, "utf8")
    .split("\n")
    .flatMap((l) => {
      try {
        return l ? [JSON.parse(l)] : [];
      } catch {
        return [];
      }
    });

const m = { sesiones: principales.length, tsc: 0, lint: 0, vitest: 0, antesDeCommit: 0, llamadas: 0, mensajes: 0 };
const sub = { n: 0, turnos: 0, ctxInicial: 0, imagenes: 0, llamadas: 0, mensajes: 0 };
/** Llamadas por herramienta (hilo + subagentes): la que más come es la primera sospechosa. */
const porHerramienta = {};
const tipo = (b) => {
  if (b.name !== "Bash") return b.name.startsWith("mcp__playwright") ? "playwright" : b.name;
  const c = b.input?.command ?? "";
  for (const [k, re] of Object.entries(GATE)) if (re.test(c)) return `gate:${k}`;
  if (/qa-capturas/.test(c)) return "qa-capturas";
  if (/^\s*(grep|rg|find|ls|cat|sed -n|head|tail|wc)\b/.test(c)) return "bash:leer";
  return "bash:otro";
};

for (const f of principales) {
  const seq = [];
  const ids = new Set();
  for (const j of lineas(f)) {
    if (j.type !== "assistant" || !Array.isArray(j.message?.content)) continue;
    for (const b of j.message.content) {
      if (b.type !== "tool_use") continue;
      m.llamadas++;
      porHerramienta[tipo(b)] = (porHerramienta[tipo(b)] ?? 0) + 1;
      ids.add(j.message.id);
      if (["Edit", "Write", "MultiEdit"].includes(b.name)) seq.push("E");
      if (b.name !== "Bash") continue;
      const cmd = b.input?.command ?? "";
      if (/git commit/.test(cmd)) seq.push("C");
      for (const [k, re] of Object.entries(GATE))
        if (re.test(cmd)) {
          m[k]++;
          seq.push("G");
          break;
        }
    }
  }
  m.mensajes += ids.size;
  // Gate seguido de commit sin edits en el medio: el pre-commit lo vuelve a correr.
  for (let i = 0; i < seq.length; i++)
    if (seq[i] === "G")
      for (let k = i + 1; k < seq.length && seq[k] !== "E"; k++)
        if (seq[k] === "C") {
          m.antesDeCommit++;
          break;
        } else if (seq[k] === "G") break;

  const dSub = f.replace(/\.jsonl$/, "") + "/subagents";
  if (!existsSync(dSub)) continue;
  for (const s of readdirSync(dSub).filter((x) => x.endsWith(".jsonl"))) {
    const vistos = new Set();
    let primero = null;
    sub.n++;
    for (const j of lineas(join(dSub, s))) {
      const c = j.message?.content;
      if (j.type === "assistant" && j.message?.usage && !vistos.has(j.message.id)) {
        vistos.add(j.message.id);
        const u = j.message.usage;
        primero ??= (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
      }
      if (!Array.isArray(c)) continue;
      for (const b of c)
        if (b.type === "tool_use") {
          sub.llamadas++;
          porHerramienta[tipo(b)] = (porHerramienta[tipo(b)] ?? 0) + 1;
          if (b.name === "Read" && /\.(png|jpe?g|webp)$/i.test(b.input?.file_path ?? "")) sub.imagenes++;
        }
    }
    sub.turnos += vistos.size;
    sub.mensajes += vistos.size;
    sub.ctxInicial += primero ?? 0;
  }
}

const r = (a, b) => (b ? Math.round((10 * a) / b) / 10 : 0);
const res = {
  medido: new Date().toISOString().slice(0, 10),
  sesiones: m.sesiones,
  "gates a mano por sesión": { typecheck: r(m.tsc, m.sesiones), lint: r(m.lint, m.sesiones), vitest: r(m.vitest, m.sesiones) },
  "gates justo antes de commit por sesión": r(m.antesDeCommit, m.sesiones),
  "llamadas por mensaje (hilo principal)": r(m.llamadas, m.mensajes),
  subagentes: sub.n,
  "turnos por subagente": r(sub.turnos, sub.n),
  "contexto inicial por subagente (tokens)": Math.round(sub.ctxInicial / Math.max(1, sub.n)),
  "capturas leídas por subagente": r(sub.imagenes, sub.n),
  "llamadas por mensaje (subagentes)": r(sub.llamadas, sub.mensajes),
};

if (process.argv.includes("--json")) {
  const baseJson = arg("comparar") && existsSync(arg("comparar")) ? JSON.parse(readFileSync(arg("comparar"), "utf8")) : null;
  const top = Object.entries(porHerramienta).sort((a, b) => b[1] - a[1]).slice(0, 3);
  /* Señal = una cifra peor que la base que tiene arreglo conocido (tabla «Economía»). */
  const senales = [];
  const peor = (v, k, umbral = 1.15) => baseJson && v > (baseJson[k] ?? Infinity) * umbral;
  if (m.antesDeCommit > 0) senales.push(`${m.antesDeCommit} gate(s) justo antes de un commit: el pre-commit ya los corre`);
  if (m.lint > 0) senales.push(`${m.lint} lint a mano: lo corre lint-staged`);
  if (peor(res["turnos por subagente"], "turnos por subagente")) senales.push(`${res["turnos por subagente"]} turnos por subagente (base ${baseJson["turnos por subagente"]}): más tandas paralelas, grep -n antes de Read`);
  if (peor(res["capturas leídas por subagente"], "capturas leídas por subagente")) senales.push(`${res["capturas leídas por subagente"]} capturas leídas por subagente (base ${baseJson["capturas leídas por subagente"]}): leer 1 por estado`);
  console.log(JSON.stringify({ ...res, top, senales }));
  process.exit(0);
}

const base = arg("comparar") && existsSync(arg("comparar")) ? JSON.parse(readFileSync(arg("comparar"), "utf8")) : null;
const plano = (o, p = "") => Object.entries(o).flatMap(([k, v]) => (typeof v === "object" ? plano(v, `${p}${k} · `) : [[p + k, v]]));
const b = base ? Object.fromEntries(plano(base)) : {};
for (const [k, v] of plano(res)) console.log(k.padEnd(52), String(v).padStart(8), base && k in b ? `  (antes ${b[k]})` : "");
if (arg("guardar")) writeFileSync(arg("guardar"), JSON.stringify(res, null, 2) + "\n");
