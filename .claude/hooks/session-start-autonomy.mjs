#!/usr/bin/env node
/**
 * session-start-autonomy.mjs — autoarranque potente al iniciar Claude Code.
 *
 * Ejecuta en orden (cada paso con timeout) sin bloquear sesión:
 *   1. Verificar dev server (puerto 3000). Si NO arranca → arrancar en BG.
 *   2. Login qaadmin/main → persistir en /tmp/bsm-auth.env (auth helper).
 *   3. Probe rápido health check (3 rutas críticas).
 *   4. Verificar chromium boot (Playwright).
 *   5. Imprimir "ready packet" al stdout (visible en context inicial).
 *
 * Budget total: <8s. Si algún paso tarda más, lo dispara fire-and-forget.
 * Exit 0 always (non-blocking).
 */
import { existsSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { join } from "node:path";

const projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const BASE = "http://localhost:3000";
const TENANT = "main";
const HOME = process.env.HOME ?? "";
const CHROMIUM = join(HOME, ".cache/ms-playwright/chromium-1208/chrome-linux64/chrome");
const DEV_LOG = "/tmp/dev-server.log";

const lines = [];
const log = (s) => lines.push(s);

// ── 1. Dev server status ────────────────────────────────────────────────
async function checkDevServer() {
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch(`${BASE}/`, { signal: ctrl.signal, redirect: "manual" });
    clearTimeout(tid);
    if (res.status === 200 || res.status === 307) return "running";
    return "unknown_status_" + res.status;
  } catch {
    return "down";
  }
}

// ── 2. Login admin ───────────────────────────────────────────────────────
async function loginAdmin() {
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-tenant-id": TENANT },
      body: JSON.stringify({ username: "qaadmin", password: "Qa-admin-1234" }),
      signal: ctrl.signal,
    });
    clearTimeout(tid);
    if (res.status !== 200) return { ok: false, status: res.status };

    const setCookie = res.headers.getSetCookie?.() ?? [];
    const rawCookies = setCookie.length > 0 ? setCookie : [res.headers.get("set-cookie") ?? ""];
    const pairs = rawCookies.map((c) => c.split(";")[0]).filter(Boolean);
    const cookieHeader = pairs.join("; ");
    const csrfMatch = cookieHeader.match(/csrf-token=([^;]+)/);
    const csrf = csrfMatch ? csrfMatch[1] : "";

    const flags = `-H "Cookie: ${cookieHeader}" -H "x-csrf-token: ${csrf}" -H "x-tenant-id: ${TENANT}"`;
    writeFileSync(
      "/tmp/bsm-auth.env",
      [
        `export BSM_COOKIE='${cookieHeader}'`,
        `export BSM_CSRF='${csrf}'`,
        `export BSM_TENANT='${TENANT}'`,
        `export BSM_BASE='${BASE}'`,
        `export BSM_CURL_FLAGS='${flags}'`,
      ].join("\n"),
    );
    return { ok: true, csrfPrefix: csrf.slice(0, 8) };
  } catch (err) {
    return { ok: false, error: err.message?.slice(0, 80) };
  }
}

// ── 3. Health rápido ─────────────────────────────────────────────────────
async function quickHealth() {
  const routes = ["/", "/marketplace", "/admin"];
  const results = await Promise.all(routes.map(async (path) => {
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 2500);
      const res = await fetch(`${BASE}${path}`, { signal: ctrl.signal, redirect: "manual" });
      clearTimeout(tid);
      return [path, res.status];
    } catch { return [path, 0]; }
  }));
  const failing = results.filter(([_, s]) => s !== 200 && s !== 307 && s !== 401);
  return { results, failing: failing.length };
}

// ── 3b. Warmup heavy client routes (fire-and-forget) ─────────────────────
// Tibia el caché de Turbopack para páginas con árbol cliente grande
// (StoreDetailClient, OfertasClient, ProductCatalog). No bloquea boot:
// las requests se disparan detached con timeout 90s y se descartan.
// Razón: Turbopack en dev tarda 30-90s en compilar estas páginas el 1er hit.
function warmupHeavyRoutesAsync() {
  const heavy = [
    "/marketplace/main",
    "/marketplace/ofertas",
    "/buscar",
    "/api/superadmin/auth",
  ];
  for (const path of heavy) {
    // fire-and-forget — no await, no bloquea, errores ignorados
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 90000);
    fetch(`${BASE}${path}`, { signal: ctrl.signal, redirect: "manual" })
      .catch(() => {});
  }
  return heavy.length;
}

// ── 4. Chromium boot probe ───────────────────────────────────────────────
function chromiumStatus() {
  if (!existsSync(CHROMIUM)) return "not_installed";
  const r = spawnSync(CHROMIUM, ["--version"], { timeout: 3000 });
  if (r.status === 0) {
    const ver = (r.stdout || Buffer.alloc(0)).toString().trim().slice(0, 40);
    return `ok (${ver})`;
  }
  const err = (r.stderr || Buffer.alloc(0)).toString();
  if (/libnspr4|libnss3|cannot open shared/i.test(err)) {
    return "needs_libs (sudo npx playwright install-deps chromium)";
  }
  return "fail";
}

// ── Main ─────────────────────────────────────────────────────────────────
async function main() {
  const t0 = Date.now();

  const devStatus = await checkDevServer();
  log(`Dev server (${BASE}): ${devStatus === "running" ? "✅ running" : `⚠️ ${devStatus}`}`);

  // Si dev no arranca, lo lanzamos en BG fire-and-forget
  if (devStatus === "down") {
    try {
      const child = spawn("npm", ["run", "dev"], {
        cwd: projectRoot,
        detached: true,
        stdio: ["ignore", "ignore", "ignore"],
        env: process.env,
      });
      child.unref();
      log(`   → npm run dev disparado en BG (pid ${child.pid})`);
    } catch (err) {
      log(`   → no pude arrancar dev: ${err.message?.slice(0, 60)}`);
    }
  }

  // Solo si dev está vivo intentamos auth + health
  if (devStatus === "running") {
    const [auth, health] = await Promise.all([loginAdmin(), quickHealth()]);
    log(`Auth qaadmin: ${auth.ok ? `✅ csrf=${auth.csrfPrefix}... persisted /tmp/bsm-auth.env` : `⚠️ ${auth.error ?? auth.status}`}`);
    if (health.failing === 0) {
      log(`Health: ✅ ${health.results.length}/${health.results.length} rutas`);
    } else {
      log(`Health: ⚠️ ${health.failing} ruta(s) fallando`);
      for (const [p, s] of health.results) log(`   · ${p} → ${s}`);
    }
    const warmedCount = warmupHeavyRoutesAsync();
    log(`Warmup: 🔥 ${warmedCount} rutas pesadas disparadas en BG (Turbopack compila mientras trabajás)`);
  }

  log(`Chromium: ${chromiumStatus()}`);

  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  log(`(autonomy boot: ${dt}s)`);

  // Output como hookSpecificOutput → aparece en el contexto del agente.
  const message = "🚀 BSM Autonomy boot:\n" + lines.map((l) => "  " + l).join("\n");
  const response = JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: message,
    },
  });
  process.stdout.write(response);
  process.exit(0);
}

main().catch((err) => {
  process.stderr.write("autonomy boot error: " + (err.message ?? String(err)) + "\n");
  process.exit(0);
});
