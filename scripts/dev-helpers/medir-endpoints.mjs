#!/usr/bin/env node
/**
 * medir-endpoints.mjs — tiempo CALIENTE de los endpoints que más pide el panel, en una llamada.
 *
 * Por qué (04-11 noche): el log del dev mezcla la compilación de Turbopack con la respuesta
 * («GET /api/x 200 in 4.7s» puede ser 4,5 s de compilar), así que no sirve para elegir qué
 * endpoint arreglar. Esto entra como qaadmin (panel) y como superadmin, llama N veces cada
 * ruta y reporta la mediana sin la 1.ª llamada (la que compila).
 *
 * Uso: node --env-file=.env.local scripts/dev-helpers/medir-endpoints.mjs [--veces 4] [--tenant main] [filtro…]
 *   Rutas: la lista de abajo (más pedidas del log del dev 04-11) o SOLO las de `--ruta "/api/…"` (repetible).
 */
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const BASE = process.env.QA_BASE || "http://localhost:3000";
const VECES = Number(arg("veces", 4));
const TENANT = arg("tenant", "main");
const extra = args.flatMap((a, i) => (a === "--ruta" ? [args[i + 1]] : []));
const filtros = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));

const RUTAS_ADMIN = [
  "/api/admin/forestal/loth/saldo-plan",
  "/api/admin/forestal/plan/bloques",
  "/api/admin/forestal/plan/documentos",
  "/api/admin/forestal/plan/documentos/papeles",
  "/api/admin/forestal/loth/caratula",
  "/api/admin/forestal/loth/extraccion",
  "/api/admin/uso-panel",
  "/api/admin/camaras/movimientos",
  "/api/admin/health",
  "/api/suppliers",
  "/api/settings",
  "/api/auth/me",
];
const RUTAS_SA = [
  "/api/superadmin/health/metrics",
  "/api/superadmin/finance-alerts",
  "/api/superadmin/notifications/inbox",
  "/api/superadmin/alerts",
  "/api/superadmin/chat/conversations",
  "/api/superadmin/commissions",
];

function cookiesDe(res) {
  return (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
}

async function entrarAdmin() {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "qaadmin", password: "Qa-admin-1234", tenantSlug: TENANT }),
  });
  if (!r.ok) throw new Error(`login admin ${r.status}`);
  return cookiesDe(r);
}

async function entrarSuperadmin() {
  const r = await fetch(`${BASE}/api/superadmin/auth`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: process.env.SUPERADMIN_USERNAME, password: process.env.SUPERADMIN_PASSWORD, honeypot: "" }),
  });
  if (!r.ok) throw new Error(`login superadmin ${r.status} (¿--env-file=.env.local?)`);
  return cookiesDe(r);
}

async function medir(ruta, cookie) {
  const tiempos = [];
  let estado = 0;
  let bytes = 0;
  for (let i = 0; i < VECES; i++) {
    const t0 = performance.now();
    const r = await fetch(`${BASE}${ruta}`, { headers: { cookie, "x-tenant-slug": TENANT } });
    const cuerpo = await r.arrayBuffer();
    tiempos.push(performance.now() - t0);
    estado = r.status;
    bytes = cuerpo.byteLength;
  }
  const calientes = tiempos.slice(1).sort((a, b) => a - b);
  const mediana = calientes[Math.floor(calientes.length / 2)] ?? tiempos[0];
  return { ruta, estado, primera: Math.round(tiempos[0]), mediana: Math.round(mediana), kb: Math.round(bytes / 1024) };
}

// Con --ruta se miden SOLO esas (la lista de abajo queda para la corrida sin argumentos).
const pasa = (r) => !filtros.length || filtros.some((f) => r.includes(f));
const esSa = (r) => r.includes("/superadmin/");
const lista = (extra.length ? extra : [...RUTAS_ADMIN, ...RUTAS_SA]).filter(pasa);
const filas = [];
const admin = lista.some((r) => !esSa(r)) ? await entrarAdmin() : "";
for (const r of lista.filter((x) => !esSa(x))) filas.push(await medir(r, admin));
const sa = lista.some(esSa) ? await entrarSuperadmin() : "";
for (const r of lista.filter(esSa)) filas.push(await medir(r, sa));
filas.sort((a, b) => b.mediana - a.mediana);
console.table(filas);
