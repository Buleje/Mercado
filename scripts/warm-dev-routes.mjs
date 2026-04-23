#!/usr/bin/env node
/**
 * warm-dev-routes — hace fetch a las rutas criticas para que Turbopack
 * las compile AHORA en vez de esperar al primer click del usuario.
 *
 * Uso: en una 2da terminal, despues de `npm run dev`:
 *   npm run dev:warm
 *
 * Tarda ~30-60s la primera vez. Siguientes runs son casi instantaneos
 * porque `turbopackFileSystemCacheForDev` persiste entre restarts.
 *
 * Resultado: cuando el usuario navegue, las paginas ya estan compiladas
 * y cargan en <1s en vez de 5-14s.
 */

import { setTimeout as sleep } from "node:timers/promises";

const BASE = process.env.DEV_BASE ?? "http://localhost:3000";

const ROUTES = [
  "/",
  "/marketplace",
  "/abrir-tienda",
  "/ayuda",
  "/tienda",
  "/descubri",
  "/t/main",
  "/t/main/tienda",
  "/t/main/admin",
  "/t/main/admin/login",
  "/signup",
];

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
  console.log(`🔥 warm-dev-routes — ${BASE}`);
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
