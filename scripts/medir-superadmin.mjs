#!/usr/bin/env node
/**
 * medir-superadmin.mjs — texto a la vista y errores de CADA página del superadmin.
 *
 * Nació del pedido de Brandon (2026-10-01): «en superadmin no me gustan las
 * descripciones muy grandes, texto muy amplio y diseño mezclado; que sea
 * minimalista, fácil de entender cada bloque, íconos donde al pasar se vea el
 * texto; y testea el superadmin para evitar errores». Es el hermano de
 * `scripts/medir-orden-admin.mjs` (mismo criterio de «ayuda», ley 60 palabras).
 *
 * Por página: estado HTTP, si terminó en el login (sesión caída = medición
 * inválida), palabras de ayuda a la vista (párrafos de 6+ palabras fuera de
 * tablas, botones, popovers y diálogos), cuántos títulos, errores de consola,
 * excepciones de la página y respuestas ≥ 400 de la API.
 *
 * Uso:
 *   node --env-file=.env.local scripts/medir-superadmin.mjs            # todas
 *   node --env-file=.env.local scripts/medir-superadmin.mjs tenants orders
 *   ... --json salida.json                                              # además a archivo
 * Credenciales: SUPERADMIN_USERNAME / SUPERADMIN_PASSWORD (.env.local).
 */

import { readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const BASE = process.env.BSM_BASE ?? "http://localhost:3000";
const ANCHO = Number(process.env.ANCHO ?? 1280);
const ESPERA_MS = Number(process.env.ESPERA_MS ?? 4000);
const LEY_AYUDA = 60;
/** Valores de muestra para los segmentos dinámicos. */
const MUESTRA = { slug: "main", id: "main", tenantId: "main" };

function rutas(dir = "app/superadmin", base = "/superadmin") {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (!statSync(p).isDirectory()) {
      if (e === "page.tsx") out.push(base);
      continue;
    }
    if (e.startsWith("_") || e.startsWith("(")) continue;
    const m = /^\[(\.\.\.)?(\w+)\]$/.exec(e);
    if (m) {
      if (m[1] || !(m[2] in MUESTRA)) continue; // catch-all o sin muestra: no se mide a ciegas
      out.push(...rutas(p, `${base}/${MUESTRA[m[2]]}`));
    } else out.push(...rutas(p, `${base}/${e}`));
  }
  return out;
}

const args = process.argv.slice(2);
const iJson = args.indexOf("--json");
const archivoJson = iJson >= 0 ? args[iJson + 1] : null;
const filtros = args.filter((a, i) => a !== "--json" && i !== iJson + 1);
const todas = rutas().filter((r) => r !== "/superadmin/login");
const lista = filtros.length ? todas.filter((r) => filtros.some((f) => r.includes(f))) : todas;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: ANCHO, height: 900 } });
const login = await ctx.request.post(`${BASE}/api/superadmin/auth`, {
  headers: { "content-type": "application/json" },
  data: { username: process.env.SUPERADMIN_USERNAME, password: process.env.SUPERADMIN_PASSWORD, honeypot: "" },
});
if (!login.ok()) {
  console.error(`❌ login superadmin falló (${login.status()}): ¿corriste con --env-file=.env.local?`);
  process.exit(1);
}

const filas = [];
for (const ruta of lista) {
  const page = await ctx.newPage();
  const consola = [];
  const excepciones = [];
  const api = [];
  page.on("console", (m) => {
    if (m.type() === "error") consola.push(m.text().replace(/\s+/g, " ").slice(0, 160));
  });
  page.on("pageerror", (e) => excepciones.push(String(e).slice(0, 160)));
  page.on("response", (r) => {
    const u = r.url();
    if (r.status() >= 400 && u.includes("/api/")) api.push(`${r.status()} ${new URL(u).pathname}`);
  });
  let estado = 0;
  try {
    const resp = await page.goto(BASE + ruta, { waitUntil: "load", timeout: 120_000 });
    estado = resp?.status() ?? 0;
    await page.waitForTimeout(ESPERA_MS);
  } catch (e) {
    excepciones.push(`NAV ${String(e).slice(0, 80)}`);
  }
  const final = new URL(page.url()).pathname;
  const m = await page
    .evaluate(() => {
      const main = document.querySelector("main") ?? document.body;
      const visibles = (sel) => [...main.querySelectorAll(sel)].filter((e) => e.offsetParent !== null);
      const textos = visibles("p")
        .filter((e) => !e.closest("table,button,[role=tooltip],[role=dialog],[role=menu],label,nav,[role=tablist]"))
        .map((e) => (e.innerText ?? "").trim().replace(/\s+/g, " "))
        .filter((t) => t.split(" ").length >= 6);
      return {
        ayuda: textos.reduce((a, t) => a + t.split(" ").length, 0),
        peor: textos.sort((a, b) => b.length - a.length)[0]?.slice(0, 90) ?? "",
        titulos: visibles("h1,h2,h3").length,
        pantallas: +(document.documentElement.scrollHeight / window.innerHeight).toFixed(1),
      };
    })
    .catch(() => ({ ayuda: -1, peor: "", titulos: 0, pantallas: 0 }));
  filas.push({ ruta, estado, enLogin: final.startsWith("/superadmin/login"), ...m, consola, excepciones, api });
  await page.close();
}
await browser.close();

filas.sort((a, b) => b.ayuda - a.ayuda);
const errores = (f) => f.consola.length + f.excepciones.length + f.api.length;
for (const f of filas) {
  const marca = f.enLogin ? "🔒" : errores(f) ? "❌" : f.ayuda > LEY_AYUDA ? "⚠️" : "✅";
  console.log(
    `${marca} ${String(f.ayuda).padStart(4)} pal · ${String(errores(f)).padStart(2)} err · ${f.estado} · ${f.ruta}` +
      (f.excepciones[0] ? `\n      excepción: ${f.excepciones[0]}` : "") +
      (f.consola[0] ? `\n      consola: ${f.consola[0]}` : "") +
      (f.api[0] ? `\n      api: ${f.api.slice(0, 3).join(" · ")}` : ""),
  );
}
const total = filas.reduce((a, f) => a + Math.max(0, f.ayuda), 0);
console.log(
  `\n${filas.length} páginas · ${total} palabras de ayuda a la vista · ${filas.filter((f) => f.ayuda > LEY_AYUDA).length} sobre la ley (${LEY_AYUDA}) · ` +
    `${filas.filter((f) => errores(f)).length} con errores · ${filas.filter((f) => f.enLogin).length} cayeron al login`,
);
if (archivoJson) writeFileSync(archivoJson, JSON.stringify(filas, null, 2));
