#!/usr/bin/env node
/**
 * Pre-dev cache guard — corre antes de `npm run dev` via npm hook "predev".
 *
 * Problema: Turbopack acumula cache en .next/dev. Si el dev server se reinicia
 * muchas veces sin limpieza (o si se matan procesos zombis), el cache puede
 * llegar a decenas de GB. Visto en prod: 45 GB que llenaron el disco C:
 * generando ENOSPC y corrompiendo el build → errores tipo "MIME application/json"
 * en assets y 500s en rutas dinámicas.
 *
 * Solución: antes de arrancar dev, si .next/dev supera el umbral, lo borramos.
 * Next.js lo regenera en el primer request (~60-90s). Trade razonable.
 *
 * Umbral default: 5 GB. Configurable via NEXT_CACHE_MAX_GB.
 *
 * Silencioso si todo OK. Logs claros si actúa.
 */

import { statSync, readdirSync, rmSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { platform } from "node:os";

const THRESHOLD_GB = Number(process.env.NEXT_CACHE_MAX_GB ?? 5);
const THRESHOLD_BYTES = THRESHOLD_GB * 1024 ** 3;
const DEV_CACHE = join(process.cwd(), ".next", "dev");
const MAX_NODE_PROCS = Number(process.env.NEXT_MAX_NODE_PROCS ?? 20);

function dirSizeBytes(dir) {
  if (!existsSync(dir)) return 0;
  let total = 0;
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = join(current, entry.name);
      try {
        if (entry.isDirectory()) {
          stack.push(full);
        } else {
          total += statSync(full).size;
        }
      } catch {
        // ignore files that vanish mid-scan
      }
    }
  }
  return total;
}

function formatGB(bytes) {
  return (bytes / 1024 ** 3).toFixed(2);
}

function countNodeProcs() {
  if (platform() !== "win32") return 0;
  try {
    const out = spawnSync(
      "powershell",
      ["-NoProfile", "-Command", "(Get-Process node -ErrorAction SilentlyContinue).Count"],
      { encoding: "utf8", windowsHide: true },
    ).stdout.trim();
    const n = Number(out);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function maybeKillZombies() {
  const count = countNodeProcs();
  if (count <= MAX_NODE_PROCS) return;
  console.log(
    `⚠️  ${count} procesos node vivos (> ${MAX_NODE_PROCS}). Lanzando dev-guardian...`,
  );
  const res = spawnSync("node", [join(process.cwd(), "scripts", "dev-guardian.mjs")], {
    stdio: "inherit",
    env: { ...process.env, MAX_HOURS: process.env.MAX_HOURS ?? "2" },
  });
  if (res.status !== 0) {
    console.warn("⚠️  dev-guardian terminó con error — continúo de todas formas.");
  }
}

function main() {
  maybeKillZombies();
  if (!existsSync(DEV_CACHE)) return;

  const size = dirSizeBytes(DEV_CACHE);
  if (size <= THRESHOLD_BYTES) return;

  console.log(
    `⚠️  .next/dev ocupa ${formatGB(size)} GB (> ${THRESHOLD_GB} GB). Limpiando...`,
  );
  const started = Date.now();
  try {
    rmSync(DEV_CACHE, { recursive: true, force: true, maxRetries: 3 });
    const ms = Date.now() - started;
    console.log(
      `✅ Cache de Turbopack liberado (${formatGB(size)} GB en ${(ms / 1000).toFixed(1)}s). Primer request tardará ~60-90s.`,
    );
  } catch (err) {
    console.warn(
      `⚠️  No pude limpiar .next/dev — probablemente hay un dev server vivo. Detenlo y reintenta.`,
    );
    console.warn(`    ${String(err instanceof Error ? err.message : err)}`);
    // No bloqueamos — dejamos que npm run dev intente de todas formas.
  }
}

main();
