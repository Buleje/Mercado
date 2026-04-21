#!/usr/bin/env node
/**
 * dev-monitor — corre en paralelo al dev server y alerta si `.next/dev` crece
 * agresivamente (default: > 1 GB/minuto). Visto en prod: bundles de Turbopack
 * pueden llegar a decenas de GB sin aviso si hay re-renders patológicos o
 * refresh loops infinitos.
 *
 * Uso:
 *   npm run dev:monitor
 *   THRESHOLD_GB_PER_MIN=0.5 npm run dev:monitor  # más estricto
 *   INTERVAL_MS=30000 npm run dev:monitor          # chequeo cada 30s
 *
 * Al detectar crecimiento excesivo:
 *   - Imprime warning grande y rate de crecimiento
 *   - Sugiere `npm run dev:nuke` si el disco se acerca a lleno
 *   - Exit voluntario solo si `EXIT_ON_ALERT=1` (default: sigue corriendo)
 */

import { readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const DEV_CACHE = join(process.cwd(), ".next", "dev");
const INTERVAL_MS = Number(process.env.INTERVAL_MS ?? 60000);
const THRESHOLD_GB_PER_MIN = Number(process.env.THRESHOLD_GB_PER_MIN ?? 1);
const ABSOLUTE_MAX_GB = Number(process.env.ABSOLUTE_MAX_GB ?? 20);
const EXIT_ON_ALERT = process.env.EXIT_ON_ALERT === "1";

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
        if (entry.isDirectory()) stack.push(full);
        else total += statSync(full).size;
      } catch {
        // file vanished — ignore
      }
    }
  }
  return total;
}

const formatGB = (b) => (b / 1024 ** 3).toFixed(2);

let lastSize = dirSizeBytes(DEV_CACHE);
let lastCheck = Date.now();

console.log(
  `dev-monitor: watching ${DEV_CACHE}\n` +
    `  interval: ${INTERVAL_MS / 1000}s, threshold: ${THRESHOLD_GB_PER_MIN} GB/min, abs max: ${ABSOLUTE_MAX_GB} GB\n` +
    `  initial: ${formatGB(lastSize)} GB`,
);

setInterval(() => {
  const now = Date.now();
  const size = dirSizeBytes(DEV_CACHE);
  const deltaGB = (size - lastSize) / 1024 ** 3;
  const deltaMin = (now - lastCheck) / 60000;
  const rate = deltaMin > 0 ? deltaGB / deltaMin : 0;
  const totalGB = size / 1024 ** 3;

  const stamp = new Date().toLocaleTimeString();

  if (totalGB >= ABSOLUTE_MAX_GB) {
    console.warn(
      `\n[${stamp}] 🔴 .next/dev = ${totalGB.toFixed(2)} GB — exceeded absolute max (${ABSOLUTE_MAX_GB} GB)\n` +
        `       Action: parar dev server y \`npm run dev:nuke\` ASAP.`,
    );
    if (EXIT_ON_ALERT) process.exit(2);
  } else if (rate > THRESHOLD_GB_PER_MIN) {
    console.warn(
      `\n[${stamp}] 🟡 .next/dev growth rate ${rate.toFixed(2)} GB/min (umbral ${THRESHOLD_GB_PER_MIN})\n` +
        `       size: ${totalGB.toFixed(2)} GB (+${deltaGB.toFixed(2)} GB in ${deltaMin.toFixed(1)} min)\n` +
        `       Posible causa: refresh loop, HMR patológico, o bundle runaway.`,
    );
    if (EXIT_ON_ALERT) process.exit(2);
  } else {
    console.log(
      `[${stamp}] ok · size ${totalGB.toFixed(2)} GB · rate ${rate >= 0 ? "+" : ""}${rate.toFixed(2)} GB/min`,
    );
  }

  lastSize = size;
  lastCheck = now;
}, INTERVAL_MS);
