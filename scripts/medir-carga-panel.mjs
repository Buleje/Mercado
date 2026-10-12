#!/usr/bin/env node
/**
 * medir-carga-panel.mjs — «el panel demora / no carga / sale un 401» medido en UNA llamada.
 *
 * Entra como qaadmin, abre la ruta en un Chromium sin ventana y lista los pedidos que fallan
 * (≥400 o cortados) o tardan más de 2 s; al final, cómo está el servidor: CPU, RSS y, con
 * --heap, la memoria de JS por el inspector (le manda SIGUSR1 a next-server).
 *
 * Por qué (12-10): para hallar el bug del recargado del servidor se armó esto a mano 5 veces.
 * Señal de ese bug: CPU de next-server > 500 % con el panel quieto y la memoria de JS
 * subiendo entre dos lecturas (`turbopackServerFastRefresh` en next.config.ts).
 *
 * Uso: node scripts/medir-carga-panel.mjs [--ruta "/admin?tab=x"] [--tenant main] [--espera 15] [--heap]
 */
import { execSync } from "node:child_process";
import { chromium } from "playwright";

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const BASE = process.env.QA_BASE || "http://localhost:3000";
const ruta = arg("ruta", "/admin");
const espera = Number(arg("espera", 15)) * 1000;

const b = await chromium.launch();
const p = await (await b.newContext()).newPage();
const inicio = new Map();
const malos = [];
let total = 0;
p.on("request", (r) => inicio.set(r, Date.now()));
p.on("response", (r) => {
  total++;
  const ms = Date.now() - (inicio.get(r.request()) ?? Date.now());
  if (r.status() >= 400 || ms > 2000) malos.push(`${r.status()} ${ms} ms ${r.url().replace(BASE, "").slice(0, 100)}`);
});
p.on("requestfailed", (r) => malos.push(`CORTADO ${r.failure()?.errorText} ${r.url().replace(BASE, "").slice(0, 100)}`));

const t0 = Date.now();
const login = await p.request.post(`${BASE}/api/auth/login`, {
  data: { username: "qaadmin", password: "Qa-admin-1234", tenantSlug: arg("tenant", "main") },
  timeout: 120_000,
});
console.log(`login ${login.status()} en ${Date.now() - t0} ms`);
const t1 = Date.now();
try {
  await p.goto(BASE + ruta, { waitUntil: "load", timeout: 180_000 });
} catch (e) {
  console.log("no terminó de cargar:", String(e.message).slice(0, 120));
}
console.log(`${ruta} cargó en ${Date.now() - t1} ms → ${p.url().replace(BASE, "")}`);
await p.waitForTimeout(espera);
console.log(`${total} pedidos en ${espera / 1000} s más · fallan o tardan >2 s: ${malos.length}`);
for (const m of malos.slice(0, 25)) console.log("  ", m);
await b.close();

const pid = execSync("pgrep -f '^next-server' | head -1").toString().trim();
if (!pid) process.exit(0);
const [rss, cpu] = execSync(`top -bn1 -p ${pid} | tail -1`).toString().trim().split(/\s+/).filter((_, i) => i === 5 || i === 8);
console.log(`next-server ${pid}: cpu ${cpu} % · rss ${rss}`);
if (!process.argv.includes("--heap")) process.exit(0);

process.kill(Number(pid), "SIGUSR1");
await new Promise((r) => setTimeout(r, 1000));
const heap = async () => {
  const [t] = await (await fetch("http://127.0.0.1:9229/json")).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  const v = await new Promise((r) => {
    ws.onmessage = (e) => r(JSON.parse(e.data).result?.result?.value);
    ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { returnByValue: true,
      expression: "Math.round(process.memoryUsage().heapUsed / 1048576)" } }));
  });
  ws.close();
  return v;
};
const h1 = await heap();
await new Promise((r) => setTimeout(r, 20_000));
const h2 = await heap();
console.log(`memoria de JS: ${h1} → ${h2} MB en 20 s${h2 - h1 > 150 ? "  ⚠ sube sola: mirar turbopackServerFastRefresh" : ""}`);
