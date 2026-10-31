#!/usr/bin/env node
/**
 * Copia a `public/mediapipe/wasm/` el motor de MediaPipe Tasks Vision
 * (`@mediapipe/tasks-vision`, versión EXACTA en package.json) para el detector
 * de personas del mosaico de cámaras (2026-10-07). Se sirve desde el MISMO
 * origen: la CSP del panel ya permite `'self'` + `'unsafe-eval'` (compilar
 * WASM) y no hace falta abrir el CDN de jsDelivr.
 *
 * Sólo lo que usa `FilesetResolver.forVisionTasks("/mediapipe/wasm")` en el
 * hilo principal: `vision_wasm_internal.*` (SIMD) y `vision_wasm_nosimd_internal.*`
 * (respaldo para navegadores sin SIMD) ≈ 23 MB. La variante `module` no se copia.
 *
 * El modelo (`public/modelos/efficientdet_lite0.tflite`, 4,6 MB, int8) va en
 * git; si falta, este script lo baja una vez de Google. Al subir de versión:
 *   npm install --save-exact @mediapipe/tasks-vision@X.Y.Z && npm run mediapipe:copiar
 *
 * Corre en `postinstall`, igual que los de tesseract y ezuikit. Nunca falla la
 * instalación: sin estos archivos el panel arranca igual y el detector dice
 * que no pudo cargar. `public/mediapipe/wasm/` está ignorado por git
 * (`public/mediapipe/.gitignore`): es regenerable.
 */
import { copyFileSync, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const origen = join(raiz, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const destino = join(raiz, "public", "mediapipe", "wasm");
const ARCHIVOS = [
  "vision_wasm_internal.js",
  "vision_wasm_internal.wasm",
  "vision_wasm_nosimd_internal.js",
  "vision_wasm_nosimd_internal.wasm",
];
const MODELO = join(raiz, "public", "modelos", "efficientdet_lite0.tflite");
const URL_MODELO =
  "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/latest/efficientdet_lite0.tflite";

let copiados = 0;
let alDia = 0;
try {
  if (!existsSync(origen)) {
    console.warn(
      "[mediapipe-assets] falta node_modules/@mediapipe/tasks-vision — ¿npm install incompleto?",
    );
  } else {
    mkdirSync(destino, { recursive: true });
    for (const nombre of ARCHIVOS) {
      const de = join(origen, nombre);
      const a = join(destino, nombre);
      if (existsSync(a) && statSync(a).size === statSync(de).size) {
        alDia++;
        continue;
      }
      copyFileSync(de, a);
      copiados++;
    }
  }
  console.log(`[mediapipe-assets] ${copiados} copiados · ${alDia} al día → public/mediapipe/wasm/`);
} catch (err) {
  console.warn(
    `[mediapipe-assets] no se pudo copiar (el detector de personas no cargará): ${err?.message ?? err}`,
  );
}

if (!existsSync(MODELO)) {
  try {
    const r = await fetch(URL_MODELO, { signal: AbortSignal.timeout(60_000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const bytes = Buffer.from(await r.arrayBuffer());
    if (bytes.subarray(4, 8).toString() !== "TFL3") throw new Error("no es un modelo TFLite");
    mkdirSync(dirname(MODELO), { recursive: true });
    writeFileSync(MODELO, bytes);
    console.log(
      `[mediapipe-assets] modelo bajado (${(bytes.length / 1e6).toFixed(1)} MB) → public/modelos/`,
    );
  } catch (err) {
    console.warn(`[mediapipe-assets] no se pudo bajar el modelo: ${err?.message ?? err}`);
  }
}
