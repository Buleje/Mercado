#!/usr/bin/env node
/**
 * Copia a `public/tesseract/` lo que el OCR del navegador necesita servir
 * desde el MISMO origen (ADR-396):
 *
 *   · el worker de tesseract.js
 *   · los tres cores WASM «lstm» (SIMD relajado / SIMD / sin SIMD — el worker
 *     elige uno según el navegador; el usuario descarga sólo ése)
 *   · el idioma español (`spa.traineddata.gz`)
 *
 * Por qué no el CDN que tesseract.js usa por defecto: la CSP del panel sólo
 * permite scripts y fetch del propio origen (y `'strict-dynamic'` en prod
 * ignora incluso `'self'` para workers si no está `worker-src`). Autohospedar
 * también hace que el OCR funcione sin internet — el patio no siempre tiene.
 *
 * Corre en `postinstall`. Nunca falla la instalación: sin estos archivos la
 * app arranca igual y el pegado de capturas avisa que el OCR no está
 * disponible. `public/tesseract/` está en .gitignore (≈22 MB regenerables).
 */
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const nm = join(raiz, "node_modules");
const destino = join(raiz, "public", "tesseract");

const CORES = ["relaxedsimd-lstm", "simd-lstm", "lstm"];
const archivos = [
  ["tesseract.js/dist/worker.min.js", "worker.min.js"],
  ...CORES.flatMap((c) => [
    [`tesseract.js-core/tesseract-core-${c}.wasm.js`, `core/tesseract-core-${c}.wasm.js`],
    [`tesseract.js-core/tesseract-core-${c}.wasm`, `core/tesseract-core-${c}.wasm`],
  ]),
  ["@tesseract.js-data/spa/4.0.0_best_int/spa.traineddata.gz", "lang/spa.traineddata.gz"],
];

let copiados = 0;
let alDia = 0;
let faltantes = 0;
for (const [desde, hasta] of archivos) {
  const origen = join(nm, desde);
  const fin = join(destino, hasta);
  if (!existsSync(origen)) {
    faltantes++;
    console.warn(`[tesseract-assets] falta ${desde} — ¿npm install incompleto?`);
    continue;
  }
  if (existsSync(fin) && statSync(fin).size === statSync(origen).size) {
    alDia++;
    continue;
  }
  mkdirSync(dirname(fin), { recursive: true });
  copyFileSync(origen, fin);
  copiados++;
}
console.log(
  `[tesseract-assets] ${copiados} copiados · ${alDia} al día · ${faltantes} faltantes → public/tesseract/`,
);
