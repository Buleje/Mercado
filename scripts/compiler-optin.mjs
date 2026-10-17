#!/usr/bin/env node
/**
 * scripts/compiler-optin.mjs — activa el React Compiler archivo por archivo.
 *
 * Por qué por archivo y no por carpeta: Next 16.2.10 sólo acepta `compilationMode` y
 * `panicThreshold` en `reactCompiler` (verificado en node_modules/next/dist/server/
 * config-schema.js:673). No hay forma de acotar el plugin a un directorio desde
 * next.config.ts — un `sources` se ignora en silencio. Con `compilationMode:"annotation"`
 * el compiler sólo toca los archivos que declaran la directiva `"use memo"`, así que la
 * directiva ES el acotado: granular, revisable en el diff y reversible con `--off`.
 *
 * Sólo marca archivos que pasan el censo de reglas duras (ver react-compiler-census.mjs):
 * refs · purity · immutability · static-components · component-hook-factories ·
 * preserve-manual-memoization · incompatible-library. Un archivo con esas violaciones
 * igual sería saltado por el compiler (bail out), así que marcarlo sólo ensucia el diff.
 *
 * Uso:
 *   node scripts/compiler-optin.mjs components/marketplace           # dry-run (default)
 *   node scripts/compiler-optin.mjs components/marketplace --apply
 *   node scripts/compiler-optin.mjs components/marketplace --off --apply
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const DURAS = [
  "react-hooks/refs",
  "react-hooks/purity",
  "react-hooks/immutability",
  "react-hooks/static-components",
  "react-hooks/component-hook-factories",
  "react-hooks/preserve-manual-memoization",
  "react-hooks/incompatible-library",
];
const DIRECTIVA = '"use memo";';

const argv = process.argv.slice(2);
const apply = argv.includes("--apply");
const quitar = argv.includes("--off");
const paths = argv.filter((a) => !a.startsWith("--"));
if (!paths.length) {
  console.error("Uso: node scripts/compiler-optin.mjs <carpeta> [--off] [--apply]");
  process.exit(1);
}

if (quitar) {
  const r = spawnSync("grep", ["-rl", DIRECTIVA, ...paths, "--include=*.tsx"], { encoding: "utf8" });
  const files = (r.stdout || "").trim().split("\n").filter(Boolean);
  console.log(`${apply ? "Quitando" : "[dry-run] Quitaría"} la directiva de ${files.length} archivos`);
  for (const f of files) {
    if (!apply) { console.log("  -", f); continue; }
    const src = readFileSync(f, "utf8");
    writeFileSync(f, src.replace(new RegExp(`^${DIRECTIVA}\\n`, "m"), ""));
  }
  if (!apply) console.log("\nAgregá --apply para escribir.");
  process.exit(0);
}

console.log(`🔬 Censando ${paths.join(", ")} para saber cuáles compilarían sin bail out…`);
const rules = Object.fromEntries(DURAS.map((r) => [r, "warn"]));
const r = spawnSync("npx", ["eslint", ...paths, "--rule", JSON.stringify(rules), "-f", "json"], {
  encoding: "utf8",
  maxBuffer: 256 * 1024 * 1024,
});
let report;
try {
  report = JSON.parse(r.stdout);
} catch {
  console.error("❌ ESLint no devolvió JSON:\n", (r.stderr || r.stdout || "").slice(0, 1500));
  process.exit(1);
}

let marcados = 0, yaEstaban = 0, saltados = 0, sinComponente = 0;
for (const f of report) {
  if (!f.filePath.endsWith(".tsx")) continue;
  if (f.messages.some((m) => DURAS.includes(m.ruleId))) { saltados++; continue; }

  const src = readFileSync(f.filePath, "utf8");
  if (src.includes(DIRECTIVA)) { yaEstaban++; continue; }
  // Sólo tiene sentido en componentes/hooks de cliente: el compiler memoiza render.
  if (!/^["']use client["'];?$/m.test(src)) { sinComponente++; continue; }

  marcados++;
  if (!apply) continue;

  // El directive prologue va junto: "use memo" DESPUÉS de "use client", antes de los imports.
  writeFileSync(
    f.filePath,
    src.replace(/^(["']use client["'];?\n)/m, `$1${DIRECTIVA}\n`),
  );
}

console.log(`\n${apply ? "✅ Marcados" : "[dry-run] Marcaría"}: ${marcados}`);
console.log(`   ya tenían la directiva: ${yaEstaban}`);
console.log(`   saltados por violación dura (el compiler los saltaría igual): ${saltados}`);
console.log(`   no son client components: ${sinComponente}`);
if (!apply) console.log("\nAgregá --apply para escribir. Revertir: mismo comando con --off --apply");
