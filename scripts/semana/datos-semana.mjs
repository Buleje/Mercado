#!/usr/bin/env node
/**
 * datos-semana.mjs — lo que pasó en la semana de Brandon, en JSON, para la
 * revisión de los domingos (Brandon 28-10-2026: «cada domingo un PDF con lo
 * que hiciste, los números de Blas y lo que falta»). Lo llama la rutina
 * «Revisión de la semana» y lo puede correr cualquier sesión.
 *
 * Uso: node scripts/semana/datos-semana.mjs   → JSON por stdout.
 *
 * Sólo LEE: el escritorio (lo que hay en «Semana actual» y lo cambiado en los
 * últimos 7 días en las 8 categorías, sin el Archivo ni los proyectos viejos)
 * y la base de Blas vía `sql-lectura.mjs` (BEGIN READ ONLY … ROLLBACK).
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ESC = "/mnt/c/Users/Usuario/OneDrive/Documentos/Escritorio";
const ACTUAL = path.join(ESC, "Semana actual");
const BLAS = "cmpxiv6p4000bohvzwl6bnfpv";
const CATEGORIAS = [
  "BLAS SAC", "Buleje (sistema)", "Comunidades (CCNN)", "Construcción",
  "Despachos y clientes", "GTF, SERFOR y cubicaciones", "Legal", "Personal y otros negocios",
];
const SALTAR = new Set(["Proyectos viejos (APP WEB)", "Blas-Operaciones", "node_modules", ".git"]);
const SEMANA_MS = 7 * 86_400_000;

/** Los archivos de `dir` (recursivo), sin temporales de Office ni desktop.ini. */
function archivos(dir, desde = 0, tope = 400) {
  const out = [];
  const pila = [dir];
  while (pila.length && out.length < tope) {
    const d = pila.pop();
    let hijos = [];
    try { hijos = readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const h of hijos) {
      if (SALTAR.has(h.name)) continue;
      const p = path.join(d, h.name);
      if (h.isDirectory()) { pila.push(p); continue; }
      if (h.name === "desktop.ini" || h.name.startsWith("~$") || h.name.startsWith(".")) continue;
      let st;
      try { st = statSync(p); } catch { continue; }
      if (st.mtimeMs < desde) continue;
      out.push({ ruta: path.relative(ESC, p), kb: Math.round(st.size / 1024), cambiado: new Date(st.mtimeMs).toISOString() });
    }
  }
  return out.sort((a, b) => b.cambiado.localeCompare(a.cambiado));
}

/** Un SELECT de sólo lectura (`sql-lectura --json`); si falla, el error va en el JSON en vez de cortar todo. */
function sql(consulta) {
  try {
    const t = execFileSync("node", ["scripts/sql-lectura.mjs", "--json", "--max", "50", consulta, BLAS], { cwd: REPO, encoding: "utf8" });
    return JSON.parse(t);
  } catch (e) {
    return { error: String(e?.stderr || e?.message || e).slice(0, 300) };
  }
}

/** `vencimientos.csv` de Blas-Operaciones: las fechas que vencen en 30 días y cuántas siguen sin fecha. */
function vencimientos() {
  const f = path.join(ESC, "BLAS SAC", "Blas-Operaciones", "vencimientos.csv");
  if (!existsSync(f)) return { error: "no está vencimientos.csv" };
  const [cab, ...filas] = readFileSync(f, "utf8").trim().split(/\r?\n/);
  const cols = cab.split(",");
  const iC = cols.indexOf("concepto"), iF = cols.indexOf("fecha de vencimiento"), iE = cols.indexOf("estado");
  const hoy = Date.now();
  const proximos = [];
  let sinFecha = 0;
  for (const l of filas) {
    /* Las observaciones traen comas entre comillas: sólo se leen las primeras columnas, que no las tienen. */
    const c = l.split(",");
    const fecha = c[iF]?.trim();
    const estado = c[iE]?.trim() ?? "";
    /* Lo ya resuelto o pagado no es «lo que falta» (28-10: el Acta de 2023 salía cada domingo). */
    if (/resuelto|cerrado|pagado|cumplido/i.test(estado)) continue;
    if (/^no vence$/i.test(fecha ?? "")) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha ?? "")) { if (!/recurrente/i.test(estado)) sinFecha++; continue; }
    const dias = Math.round((Date.parse(`${fecha}T12:00:00Z`) - hoy) / 86_400_000);
    if (dias <= 30) proximos.push({ concepto: c[iC], fecha, dias, estado });
  }
  return { proximos: proximos.sort((a, b) => a.dias - b.dias), sinFecha };
}

const marca = path.join(ACTUAL, ".semana.txt");
const [semana, lunes] = existsSync(marca) ? readFileSync(marca, "utf8").replace(/^﻿/, "").trim().split("|") : [null, null];
const desde = Date.now() - SEMANA_MS;
const T = `"tenantId"=$1`;

// «Semana N (26-oct al 1-nov)»: el mismo nombre que la carpeta del registro y el archivo del lunes (Semana 1 = 26-10-2026).
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];
function nombreDeSemana(lun) {
  if (!lun) return null;
  const l = new Date(`${lun}T12:00:00Z`);
  const d = new Date(l.getTime() + 6 * 86_400_000);
  const n = Math.round((l - new Date("2026-10-26T12:00:00Z")) / SEMANA_MS) + 1;
  return `Semana ${n} (${l.getUTCDate()}-${MESES[l.getUTCMonth()]} al ${d.getUTCDate()}-${MESES[d.getUTCMonth()]})`;
}

const datos = {
  generado: new Date().toISOString(),
  semana, lunes, nombreSemana: nombreDeSemana(lunes),
  enSemanaActual: Object.fromEntries(CATEGORIAS.map((c) => [c, archivos(path.join(ACTUAL, c)).map((a) => a.ruta)])),
  cambiadosEstaSemana: Object.fromEntries(CATEGORIAS.map((c) => [c, archivos(path.join(ESC, c), desde, 60)])),
  // Carpetas de casos de la semana: `sigue` = tienen la marca .en-curso (comando `semana sigue`) y el lunes pasan a la semana nueva.
  casos: CATEGORIAS.flatMap((c) => {
    let hijos = [];
    try { hijos = readdirSync(path.join(ACTUAL, c), { withFileTypes: true }); } catch { return []; }
    return hijos
      .filter((h) => h.isDirectory() && !h.name.startsWith(".") && !(c === "BLAS SAC" && h.name.startsWith("Semana ")))
      .map((h) => ({
        categoria: c, carpeta: h.name,
        archivos: archivos(path.join(ACTUAL, c, h.name)).length,
        sigue: existsSync(path.join(ACTUAL, c, h.name, ".en-curso")),
      }));
  }),
  blas: {
    adelantosAbiertos: sql(`select direccion, count(*)::int n, round(sum("saldoPendiente")::numeric,2) saldo from "Adelanto" where ${T} and status='ABIERTO' group by direccion`),
    adelantosDeLaSemana: sql(`select count(*)::int n, round(coalesce(sum("montoAdelantado"),0)::numeric,2) monto from "Adelanto" where ${T} and "fechaAdelanto" >= now() - interval '7 days'`),
    vencenEn14Dias: sql(`select b.nombre, round(a."saldoPendiente"::numeric,2) saldo, a."fechaVencimiento"::date vence from "Adelanto" a join "AdelantoBeneficiario" b on b.id = a."beneficiarioId" where a.${T} and a.status='ABIERTO' and a."fechaVencimiento" < now() + interval '14 days' order by a."fechaVencimiento"`),
    libroDeLaSemana: sql(`select section, count(*)::int n, round(coalesce(sum(quantity),0)::numeric,3) cantidad, round(coalesce(sum("volumeInputM3"),0)::numeric,3) m3_consumido from "ForestCtpEntry" where ${T} and "entryDate" >= now() - interval '7 days' group by section`),
    cubicacionesPorValorizar: sql(`select count(*)::int n, round(coalesce(sum(volumen),0)::numeric,3) m3 from "ForestCubicacionTrozas" where ${T} and estado='borrador'`),
    cubicacionesGuardadasEstaSemana: sql(`select count(*)::int n from "PlatformSetting" s, jsonb_array_elements(s.value) e where s.key = 'ctp-cubicaciones:' || $1 and (e->>'updatedAt')::timestamptz >= now() - interval '7 days'`),
  },
  vencimientos: vencimientos(),
};
console.log(JSON.stringify(datos, null, 1));
