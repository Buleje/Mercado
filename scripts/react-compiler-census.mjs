#!/usr/bin/env node
/**
 * scripts/react-compiler-census.mjs — ¿qué tan lejos estamos de compilationMode:"infer"?
 *
 * El React Compiler v1 no rompe código: cuando detecta un patrón que no puede compilar
 * de forma segura, SALTA ese componente (bail out). O sea, el costo de `infer` no es
 * "se rompe", es "no te memoiza justo donde más falta". Este censo mide dónde.
 *
 * Las reglas de eslint-plugin-react-hooks v7 están en "off" en eslint.config.mjs porque
 * lint-staged corre con --max-warnings 0 y un warn bloquearía el commit. Este script las
 * enciende SOLO para medir, sin tocar el gate.
 *
 * Baseline medido 2026-09-22 (3.305 archivos: components/marketplace + components/admin + app):
 *   DURAS (el compiler salta el componente):
 *     refs 79 · purity 39 · static-components 20 · immutability 19
 *     preserve-manual-memoization 14  → 171 en total
 *   PATRÓN (no bloquean, sí son deuda):
 *     set-state-in-effect 593 · exhaustive-deps 153
 *
 * Uso:
 *   node scripts/react-compiler-census.mjs                    # todo
 *   node scripts/react-compiler-census.mjs components/admin   # una carpeta
 *   node scripts/react-compiler-census.mjs --clean components/marketplace
 *        ↑ lista los archivos SIN violaciones duras = los que `infer` sí compilaría
 */
import { spawnSync } from "node:child_process";

const DURAS = [
  "react-hooks/refs",
  "react-hooks/purity",
  "react-hooks/immutability",
  "react-hooks/static-components",
  "react-hooks/component-hook-factories",
  "react-hooks/preserve-manual-memoization",
  "react-hooks/incompatible-library",
];

const argv = process.argv.slice(2);
const soloLimpios = argv.includes("--clean");
const targets = argv.filter((a) => !a.startsWith("--"));
const paths = targets.length ? targets : ["components", "app"];

const rules = Object.fromEntries(DURAS.map((r) => [r, "warn"]));
console.log(`🔬 Censando ${paths.join(", ")} con ${DURAS.length} reglas duras del React Compiler…`);

const r = spawnSync(
  "npx",
  ["eslint", ...paths, "--rule", JSON.stringify(rules), "-f", "json"],
  { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
);

let report;
try {
  report = JSON.parse(r.stdout);
} catch {
  console.error("❌ ESLint no devolvió JSON. Salida:\n", (r.stderr || r.stdout || "").slice(0, 2000));
  process.exit(1);
}

const porRegla = {};
const porCarpeta = {};
const limpios = [];
let sucios = 0;

for (const f of report) {
  const rel = f.filePath.split(`${process.cwd()}/`)[1] ?? f.filePath;
  const hits = f.messages.filter((m) => DURAS.includes(m.ruleId));
  if (!hits.length) {
    limpios.push(rel);
    continue;
  }
  sucios++;
  const carpeta = rel.split("/").slice(0, 3).join("/");
  porCarpeta[carpeta] = (porCarpeta[carpeta] ?? 0) + hits.length;
  for (const h of hits) porRegla[h.ruleId] = (porRegla[h.ruleId] ?? 0) + 1;
}

const total = Object.values(porRegla).reduce((a, b) => a + b, 0);

if (soloLimpios) {
  console.log(`\n✅ ${limpios.length} archivos compilarían con "infer" sin bail out:\n`);
  for (const f of limpios) console.log("  ", f);
  process.exit(0);
}

console.log(`\n📊 ${report.length} archivos · ${sucios} con violación dura · ${total} violaciones`);
console.log(`   ${limpios.length} limpios (${((limpios.length / report.length) * 100).toFixed(1)} %) — esos gana "infer"\n`);
console.log("── por regla ──");
for (const [k, v] of Object.entries(porRegla).sort((a, b) => b[1] - a[1])) {
  console.log(String(v).padStart(5), k);
}
console.log("\n── peores carpetas ──");
for (const [k, v] of Object.entries(porCarpeta).sort((a, b) => b[1] - a[1]).slice(0, 12)) {
  console.log(String(v).padStart(5), k);
}
console.log("\n💡 Carpeta con 0 duras = candidata a piloto de `infer` en next.config.ts");
