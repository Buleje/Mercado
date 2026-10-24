#!/usr/bin/env node
/**
 * medir-carga.mjs — qué pasa al abrir una ruta (con sesión qaadmin de main):
 * cuánto tarda (load, red quieta, LCP), cuánto salta la página (CLS), cuántos
 * pedidos, los /api más lentos y los REPETIDOS (la misma ruta pedida 2+ veces).
 *
 * Nació el 16-10 para la estrategia de velocidad (Brandon: «la carga demora
 * demasiado en admin, tienda, inicio… quiero una solución más agresiva»).
 * Contra el dev server (:3000) o el compilado (QA_BASE=http://localhost:3100).
 *
 *   node scripts/medir-carga.mjs "/admin?tab=plata" [ancho=1280] [--json]
 */
import { chromium } from "playwright";
const BASE = process.env.QA_BASE || "http://localhost:3000";
const ruta = process.argv[2] || "/admin";
const ancho = Number(process.argv[3] || 1280);
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: ancho, height: 900 } });
const p = await ctx.newPage();
const login = await p.request.post(`${BASE}/api/auth/login`, { data: { username: "qaadmin", password: "Qa-admin-1234", tenantSlug: "main" }, timeout: 120_000 });
const filas = [];
let t0 = 0;
p.on("requestfinished", async (r) => {
  const t = r.timing();
  const res = await r.response();
  let kb = 0;
  try { kb = ((await r.sizes()).responseBodySize || 0) / 1024; } catch {}
  filas.push({ url: r.url().replace(BASE, ""), tipo: r.resourceType(), inicio: Math.round(t.startTime - t0), ms: Math.round(t.responseEnd), st: res?.status() ?? 0, kb });
});
t0 = Date.now();
await p.goto(BASE + ruta, { waitUntil: "load", timeout: 180_000 }).catch((e) => console.log("goto", String(e).slice(0, 100)));
const tLoad = Date.now() - t0;
await p.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => {});
const tIdle = Date.now() - t0;
await p.waitForTimeout(3000);
const lcp = await p.evaluate(() => new Promise((ok) => { let v = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) v = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true }); setTimeout(() => ok(Math.round(v)), 300); }));
// CLS: suma de los saltos sin interacción reciente (lo que Google llama «la página se mueve»).
const cls = await p.evaluate(() => new Promise((ok) => { let v = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) v += e.value; }).observe({ type: "layout-shift", buffered: true }); setTimeout(() => ok(Math.round(v * 1000) / 1000), 300); }));
const api = filas.filter((f) => f.url.startsWith("/api/"));
const js = filas.filter((f) => f.tipo === "script");
const sum = (a) => a.reduce((n, f) => n + f.kb, 0);
console.log(`${BASE}${ruta} @${ancho} · login ${login.status()} · load ${tLoad} ms · sin red ${tIdle} ms · LCP ${lcp} ms · CLS ${cls} · final ${p.url().replace(BASE, "")}`);
console.log(`pedidos ${filas.length} · /api ${api.length} (${sum(api).toFixed(0)} KB) · JS ${js.length} (${sum(js).toFixed(0)} KB sin comprimir) · fallan ${filas.filter((f) => f.st >= 400).length}`);
const ms = api.map((f) => f.ms).sort((a, b) => a - b);
if (ms.length) console.log(`/api ms: mediana ${ms[Math.floor(ms.length / 2)]} · p90 ${ms[Math.floor(ms.length * 0.9)]} · máx ${ms.at(-1)} · último /api termina a los ${Math.max(...api.map((f) => f.inicio + f.ms))} ms`);
const porRuta = new Map();
for (const f of api) { const k = f.url.split("?")[0]; const e = porRuta.get(k) ?? { n: 0, ms: 0, kb: 0 }; e.n++; e.ms = Math.max(e.ms, f.ms); e.kb += f.kb; porRuta.set(k, e); }
console.log("/api más lentos (ruta · veces · máx ms · KB):");
for (const [k, e] of [...porRuta].sort((a, b) => b[1].ms - a[1].ms).slice(0, 14)) console.log(`  ${k.slice(0, 70).padEnd(70)} ${String(e.n).padStart(2)} ${String(e.ms).padStart(6)} ${e.kb.toFixed(0).padStart(5)}`);
console.log("repetidos:", [...porRuta].filter(([, e]) => e.n > 1).map(([k, e]) => `${k}×${e.n}`).join(" ") || "ninguno");
await b.close();
