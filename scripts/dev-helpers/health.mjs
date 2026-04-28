#!/usr/bin/env node
/**
 * health — smoke test rápido del dev server local.
 *
 * Curl 6 rutas críticas + tail dev log buscando errores + grep N+1
 * warnings, todo en paralelo. Output: tabla compacta + verdict global.
 *
 * Uso:
 *   node scripts/dev-helpers/health.mjs
 *
 * Reemplaza el patrón manual:
 *   curl -s -o /dev/null -w "..." (×6) + tail /tmp/dev-server.log + grep error
 */
import { readFileSync, existsSync } from "node:fs";

const BASE = process.env.BSM_BASE || "http://localhost:3000";
const LOG = process.env.BSM_DEV_LOG || "/tmp/dev-server.log";

const ROUTES = [
  { path: "/", label: "home", expectedStatus: [200] },
  { path: "/marketplace", label: "marketplace", expectedStatus: [200] },
  { path: "/marketplace/main", label: "storefront/main", expectedStatus: [200] },
  { path: "/admin", label: "admin (redirect)", expectedStatus: [200, 307] },
  { path: "/superadmin", label: "superadmin (redirect)", expectedStatus: [200, 307, 401] },
  { path: "/api/marketplace/stores", label: "API stores", expectedStatus: [200] },
];

function fmtTime(ms) {
  if (ms < 100) return `${ms}ms ✓`;
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s ${ms > 5000 ? "⚠️ slow" : ""}`;
}

async function checkRoute(route) {
  const t0 = Date.now();
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(`${BASE}${route.path}`, { signal: ctrl.signal, redirect: "manual" });
    clearTimeout(tid);
    const dt = Date.now() - t0;
    const ok = route.expectedStatus.includes(res.status);
    return {
      ...route,
      status: res.status,
      ms: dt,
      ok,
      verdict: ok ? "✅" : "❌",
    };
  } catch (err) {
    return {
      ...route,
      status: 0,
      ms: Date.now() - t0,
      ok: false,
      verdict: "❌",
      error: err.message?.slice(0, 60),
    };
  }
}

function scanLog(logPath, lastN = 200) {
  if (!existsSync(logPath)) return { errors: [], warns: [], n1: 0, lines: 0 };
  try {
    const buf = readFileSync(logPath, "utf8");
    const lines = buf.split("\n").slice(-lastN);
    const errors = lines.filter((l) => /\[ERROR\]|⨯|❌|TypeError|SyntaxError|Cannot find/i.test(l));
    const warns = lines.filter((l) => /\[WARN\]/i.test(l) && !/\bN\+1/.test(l));
    const n1 = lines.filter((l) => /N\+1 DETECTED/i.test(l)).length;
    return { errors, warns, n1, lines: lines.length };
  } catch {
    return { errors: [], warns: [], n1: 0, lines: 0 };
  }
}

async function main() {
  console.log(`🔍 Health check · ${BASE}`);
  console.log("─".repeat(60));

  const t0 = Date.now();
  const [results, log] = await Promise.all([
    Promise.all(ROUTES.map(checkRoute)),
    Promise.resolve(scanLog(LOG)),
  ]);

  // Routes table
  console.log("Ruta                          Status  Tiempo");
  console.log("─".repeat(60));
  for (const r of results) {
    const path = (r.label + " (" + r.path + ")").padEnd(30, " ");
    const status = String(r.status).padEnd(7, " ");
    console.log(`${r.verdict} ${path}${status}${fmtTime(r.ms)}`);
  }

  // Log scan
  console.log("\n📜 Log scan (últimas 200 líneas)");
  console.log("─".repeat(60));
  console.log(`Errors:   ${log.errors.length}${log.errors.length > 0 ? " ⚠️" : " ✅"}`);
  console.log(`Warns:    ${log.warns.length}`);
  console.log(`N+1:      ${log.n1}${log.n1 > 0 ? " (revisar queries)" : ""}`);
  if (log.errors.length > 0) {
    console.log("\nErrores recientes:");
    for (const e of log.errors.slice(-3)) {
      console.log("  · " + e.slice(0, 120));
    }
  }

  // Verdict
  const failed = results.filter((r) => !r.ok);
  const slow = results.filter((r) => r.ms > 3000);
  const verdict = failed.length === 0 && log.errors.length === 0 ? "✅ HEALTHY" : "⚠️ ISSUES";
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log("\n" + "─".repeat(60));
  console.log(`${verdict} · ${results.length} rutas · ${log.errors.length} errors · check completo en ${dt}s`);

  process.exit(failed.length > 0 || log.errors.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Health check failed:", err.message);
  process.exit(1);
});
