#!/usr/bin/env node
/**
 * Deja servido desde el MISMO origen el motor que lee los marcadores de troza
 * de las cámaras (ADR-480, 2026-10-08):
 *
 * - `public/opencv/opencv.js` (≈13,3 MB, 3,75 MB con gzip): OpenCV.js de
 *   `@techstark/opencv-js` en la versión EXACTA de package.json
 *   (5.0.0-release.1, Apache-2.0), con el WASM adentro. Lo baja el worker
 *   `marcadores.worker.ts` sólo cuando alguien cuenta trozas.
 *
 * Mismo patrón que `copy-onnx-assets.mjs`. Corre en `postinstall` y nunca
 * falla la instalación: sin el archivo, «Contar ahora» dice que falta el
 * motor. El destino está ignorado por git.
 */
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const origen = join(raiz, "node_modules", "@techstark", "opencv-js", "dist", "opencv.js");
const destino = join(raiz, "public", "opencv", "opencv.js");

try {
  if (!existsSync(origen)) {
    console.warn("[opencv-assets] falta node_modules/@techstark/opencv-js — ¿npm install incompleto?");
  } else if (existsSync(destino) && statSync(destino).size === statSync(origen).size) {
    console.log("[opencv-assets] al día → public/opencv/opencv.js");
  } else {
    mkdirSync(dirname(destino), { recursive: true });
    copyFileSync(origen, destino);
    console.log("[opencv-assets] copiado → public/opencv/opencv.js");
  }
} catch (err) {
  console.warn(`[opencv-assets] no se pudo copiar OpenCV.js: ${err.message}`);
}
