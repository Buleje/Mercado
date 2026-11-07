#!/usr/bin/env node
/**
 * warm-dev-routes — hace fetch a las rutas criticas para que Turbopack
 * las compile AHORA en vez de esperar al primer click del usuario.
 *
 * Uso: en una 2da terminal, despues de `npm run dev`:
 *   npm run dev:warm            → tienda + marketplace + panel (todo)
 *   npm run dev:warm -- --admin → SOLO el panel (4 rutas, ~8s)
 *   npm run dev:warm -- --tienda → solo tienda/marketplace
 *
 * MEDIDO 2026-09-18: calentar las 14 rutas cuesta 45 s y deja al dev server en
 * 8.76 GB de RSS (la RAM la come COMPILAR, no el paso del tiempo). Si el día es
 * de panel, `--admin` evita compilar storefront y marketplace al pedo.
 *
 * Tarda ~30-60s la primera vez. Siguientes runs son casi instantaneos
 * porque `turbopackFileSystemCacheForDev` persiste entre restarts.
 *
 * Resultado: cuando el usuario navegue, las paginas ya estan compiladas
 * y cargan en <1s en vez de 5-14s.
 */

import { setTimeout as sleep } from "node:timers/promises";

const BASE = process.env.DEV_BASE ?? "http://localhost:3000";

// Brandon 2026-06-05: lista actualizada al FLUJO REAL de navegación del
// marketplace (antes calentaba rutas viejas /tienda /t/main/admin que ya casi
// no se usan, y NO calentaba /tiendas, storefront, producto, ofertas, carrito —
// justo las que el usuario recorre → se sentían "frías"/lentas al navegar).
// El panel es UNA ruta de servidor con 133 pestañas en `next/dynamic`: calentar
// /admin compila el shell, y los chunks de cada pestaña se compilan al abrirla
// (un fetch no ejecuta JS, así que no hay forma de adelantarlos desde acá).
// Las dos APIs son las que el shell pide siempre al montar.
const ADMIN_ROUTES = [
  "/admin",
  "/login",
  "/api/auth/me",
  "/api/notification-center?limit=50",
];

const TIENDA_ROUTES = [
  "/",
  "/marketplace",
  "/tiendas",
  "/marketplace/explorar",
  "/marketplace/ofertas",
  "/marketplace/buscar",
  "/marketplace/carrito",
  "/marketplace/mi-cuenta",
  "/marketplace/como-pagar",
  "/marketplace/mi-pollo", // storefront [slug] — compila la ruta dinámica
  "/marketplace/mi-pollo/producto/1252510", // detalle de producto [slug]/producto/[id]
  "/abrir-tienda",
  "/negocios",
  "/ayuda",
];

const modo = process.argv.includes("--admin")
  ? "admin"
  : process.argv.includes("--tienda")
    ? "tienda"
    : "todo";
const ROUTES =
  modo === "admin"
    ? ADMIN_ROUTES
    : modo === "tienda"
      ? TIENDA_ROUTES
      : [...TIENDA_ROUTES, ...ADMIN_ROUTES];

async function waitForDevServer(maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(BASE + "/", { signal: AbortSignal.timeout(2000) });
      if (res.status < 500) return true;
    } catch {
      // not ready yet
    }
    await sleep(1000);
  }
  return false;
}

async function warmRoute(route) {
  const url = BASE + route;
  const t0 = performance.now();
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "warm-dev-routes/1.0" },
      signal: AbortSignal.timeout(60_000),
    });
    await res.text(); // consume body
    const ms = Math.round(performance.now() - t0);
    const flag = ms > 5000 ? "🐢" : ms > 2000 ? "⏳" : "✅";
    console.log(`${flag} ${String(ms).padStart(6)}ms  ${res.status}  ${route}`);
    return { route, ms, status: res.status };
  } catch (err) {
    console.log(`❌        ERR  ${route}  ${err instanceof Error ? err.message : err}`);
    return { route, ms: 0, status: 0 };
  }
}

async function main() {
  console.log(`🔥 warm-dev-routes — ${BASE} · modo: ${modo}`);
  console.log("   Esperando al dev server...");
  const ok = await waitForDevServer();
  if (!ok) {
    console.error("❌ Dev server no respondio en 30s. Arranca con: npm run dev");
    process.exit(1);
  }
  console.log(`   Dev server listo. Calentando ${ROUTES.length} rutas...\n`);

  const total0 = performance.now();
  const results = [];
  for (const route of ROUTES) {
    results.push(await warmRoute(route));
  }
  const totalMs = Math.round(performance.now() - total0);

  const slow = results.filter((r) => r.ms > 3000).length;
  const errors = results.filter((r) => r.status === 0 || r.status >= 500).length;
  console.log(`\n─────────────────────────────────`);
  console.log(`Total: ${(totalMs / 1000).toFixed(1)}s · ${results.length} rutas · ${slow} lentas · ${errors} errores`);
  console.log(`Ahora las rutas quedan calientes. Navegacion subsiguiente: <1s.`);
}

main();
