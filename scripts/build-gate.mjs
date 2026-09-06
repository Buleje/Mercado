#!/usr/bin/env node
/**
 * build-gate.mjs — gate AUTORITATIVO de "listo" (matchea CI) en un solo comando.
 *
 * Hace la danza completa que antes se hacía a mano (y se rompía por exit codes
 * de pkill en comandos compuestos):
 *   1. Mata el árbol del dev server (libera ~7GB para el build).
 *   2. Limpia .next (evita el cache corrupto de .next/dev/types — TS1128/TS1109).
 *   3. Corre `npm run build` (tsc -p tsconfig.build.json + next build).
 *   4. Parsea el resultado y da un VEREDICTO con evidencia pegable.
 *   5. Re-levanta el dev server (salvo --no-restart) y espera health 200.
 *
 * Uso:
 *   node scripts/build-gate.mjs               # gate completo + restart dev
 *   node scripts/build-gate.mjs --no-restart  # solo build (ej. CI local)
 *   node scripts/build-gate.mjs --keep-next   # no wipea .next (build incremental)
 *
 * Exit code: 0 = build limpio · 1 = build falló (el veredicto dice dónde).
 * Log completo: /tmp/build-gate.log
 */
import { execSync, spawn } from "node:child_process";
import fs from "node:fs";

const LOG = "/tmp/build-gate.log";
const noRestart = process.argv.includes("--no-restart");
const keepNext = process.argv.includes("--keep-next");
const sh = (cmd) => { try { return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim(); } catch { return ""; } };
const log = (s) => console.log(s);

// ── 1. Matar dev server (tolerante: pkill sin match no rompe nada) ──────────
log("① Matando dev server (libera RAM para el build)…");
sh("pkill -f 'next-server' || true");
sh("pkill -f 'next dev' || true");
sh("pkill -f 'npm run dev' || true");
await new Promise((r) => setTimeout(r, 2500));
sh("pkill -9 -f 'next-server' || true");
const freeMb = Number(sh("awk '/MemAvailable/{print int($2/1024)}' /proc/meminfo")) || 0;
log(`   RAM libre: ${freeMb} MB`);
if (freeMb < 3000) log("   ⚠ Menos de 3GB libres — el build puede morir por OOM.");

// ── 2. Limpiar .next ─────────────────────────────────────────────────────────
if (!keepNext) {
  log("② Limpiando .next (evita cache corrupto de types)…");
  fs.rmSync(".next", { recursive: true, force: true });
} else {
  // Aun con --keep-next, el cache de types de dev es la fuente típica de
  // TS1128/TS1109 fantasma: se limpia siempre.
  log("② --keep-next: limpio solo .next/dev (cache de types corruptible)…");
  fs.rmSync(".next/dev", { recursive: true, force: true });
}

// ── 3. Build ─────────────────────────────────────────────────────────────────
log(`③ npm run build (log completo: ${LOG})…`);
const t0 = Date.now();
let out = "";
try {
  out = execSync("npm run build 2>&1", {
    encoding: "utf8",
    env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=8192" },
    maxBuffer: 64 * 1024 * 1024,
  });
} catch (e) {
  out = String(e.stdout ?? "") + String(e.stderr ?? "");
}
fs.writeFileSync(LOG, out);
const secs = Math.round((Date.now() - t0) / 1000);

// ── 4. Veredicto ─────────────────────────────────────────────────────────────
const compiled = /Compiled successfully/i.test(out);
const pagesMatch = out.match(/Generating static pages(?: using \d+ workers)? \((\d+)\/(\d+)\)(?! )/);
const staticOk = /✓ Generating static pages/.test(out);
const routeTable = /\(Static\)\s+prerendered as static content/.test(out);
const errLines = out.split("\n").filter((l) =>
  /error TS|Type error:|Failed to compile|Export encountered an error|Error occurred prerendering|⨯ Next\.js build worker exited/.test(l),
);
const ok = compiled && errLines.length === 0 && (staticOk || routeTable);

log("");
log("═══════════ VEREDICTO BUILD-GATE ═══════════");
log(`   Compile:        ${compiled ? "✓ Compiled successfully" : "✗ NO compiló"} (${secs}s)`);
log(`   Static pages:   ${staticOk ? `✓ ${pagesMatch ? pagesMatch[2] + " páginas" : "todas"}` : routeTable ? "✓ route table impresa" : "✗ no llegó"}`);
log(`   Errores:        ${errLines.length === 0 ? "0" : errLines.length}`);
for (const l of errLines.slice(0, 8)) log(`     ${l.trim().slice(0, 150)}`);
log(`   RESULTADO:      ${ok ? "✅ BUILD LIMPIO — apto para reportar listo" : "❌ BUILD FALLÓ — NO reportar listo"}`);
log("═════════════════════════════════════════════");

// ── 5. Re-levantar dev ───────────────────────────────────────────────────────
sh("pkill -9 -f 'next build' || true"); // trace-collection lingering post-éxito
if (!noRestart) {
  log("⑤ Re-levantando dev server…");
  const dev = spawn("npm", ["run", "dev"], { detached: true, stdio: ["ignore", fs.openSync("/tmp/dev-server.log", "a"), fs.openSync("/tmp/dev-server.log", "a")] });
  dev.unref();
  let up = false;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 4000));
    const code = sh("curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://localhost:3000/api/health");
    if (code === "200") { up = true; break; }
  }
  log(up ? "   ✓ dev server arriba (health 200), log: /tmp/dev-server.log" : "   ⚠ dev server no respondió en 160s — revisá /tmp/dev-server.log");
}

process.exit(ok ? 0 : 1);
