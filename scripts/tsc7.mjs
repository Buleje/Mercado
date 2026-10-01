#!/usr/bin/env node
/**
 * scripts/tsc7.mjs — gate de tipos con el compilador nativo de TypeScript 7 (Go).
 *
 * Por qué existe (medido 2026-09-22 sobre este repo, 3.236 .ts + 2.661 .tsx):
 *   tsc 5.9 (JS, con tsbuildinfo caliente) ... 195,5 s · 6,7 GB
 *   tsc 7.0.2 nativo, en frío .............. 49,6 s · 6,9 GB
 *   tsc 7.0.2 nativo, en caliente .......... 22,5 s · 7,0 GB
 *   → 8,7x mas rapido en el caso que corre el pre-commit. Mismo resultado: 0 errores.
 *
 * Por qué NO subimos el paquete `typescript` a 7.x:
 *   TS 7.0 todavía no expone una API programática estable (llega en 7.1). typescript-eslint,
 *   Storybook (react-docgen-typescript) y el typecheck interno de Next la usan. Subir el
 *   paquete pisaría `node_modules/.bin/tsc` y rompería esas herramientas.
 *   Estrategia: `typescript` sigue en 5.9 para la API; el GATE usa el binario nativo.
 *
 * Fallback: si no hay binario nativo para esta plataforma, cae a tsc 5.9 con heap ampliado.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);

const ARCH = { x64: "x64", arm64: "arm64", arm: "arm", ppc64: "ppc64", s390x: "s390x" };
const pkg = `@typescript/typescript-${process.platform}-${ARCH[process.arch] ?? process.arch}`;
const native = path.join(root, "node_modules", pkg, "lib", "tsc");

if (existsSync(native)) {
  const t0 = Date.now();
  const r = spawnSync(native, args, { stdio: "inherit", cwd: root });
  if (r.status === 0) {
    console.log(`✅ tsc nativo (${pkg}) — ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
  process.exit(r.status ?? 1);
}

// ── Fallback: tsc 5.9 (JS) ───────────────────────────────────────────────────
let legacy;
try {
  legacy = createRequire(import.meta.url).resolve("typescript/bin/tsc");
} catch {
  console.error(`❌ No hay ni ${pkg} ni el paquete typescript instalado.`);
  console.error(`   Instalá el nativo de tu plataforma: npm i -D ${pkg}@7`);
  process.exit(1);
}
console.warn(`⚠️  Sin binario nativo para ${process.platform}/${process.arch} — usando tsc 5.9 (lento).`);
console.warn(`   Para el gate rápido: npm i -D ${pkg}@7`);
const r = spawnSync(process.execPath, [legacy, ...args], {
  stdio: "inherit",
  cwd: root,
  env: { ...process.env, NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --max-old-space-size=8192`.trim() },
});
process.exit(r.status ?? 1);
