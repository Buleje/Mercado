#!/usr/bin/env node
/**
 * Deja servidos desde el MISMO origen el motor y el modelo del detector de
 * personas del mosaico de cámaras (ADR-475, 2026-10-08):
 *
 * - `public/onnxruntime/ort-wasm-simd-threaded.asyncify.{wasm,mjs}` (≈26 MB):
 *   el motor de `onnxruntime-web/webgpu` (versión EXACTA en package.json) y su
 *   cargador: con `wasmPaths` el worker pide los DOS a esa carpeta (medido: sin
 *   el `.mjs`, 404 y «initWasm() failed»). Sirve para la tarjeta gráfica
 *   (WebGPU) y para el procesador (WASM).
 * - `public/modelos/dfine_s_obj2coco.onnx` (≈41,5 MB): D-FINE-S (Apache-2.0),
 *   bajado UNA vez de Hugging Face en una revisión fija y verificado por hash.
 *   Se guarda también en `node_modules/.cache/buleje-modelos/` para que una
 *   reinstalación (o el build con caché) no lo vuelva a bajar.
 *
 * Por qué D-FINE: medido sobre 8 cuadros reales de las cámaras de Blas
 * (08-10), el detector de MediaPipe vio 0 personas; D-FINE-S con zoom donde
 * hay movimiento las vio con 0,55-0,67 de confianza (personas de 10×19 px).
 *
 * Corre en `postinstall`. Nunca falla la instalación: sin estos archivos el
 * mosaico usa el detector liviano de respaldo (MediaPipe). Los dos destinos
 * están ignorados por git.
 */
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const MOTOR = ["ort-wasm-simd-threaded.asyncify.wasm", "ort-wasm-simd-threaded.asyncify.mjs"];
const dist = join(raiz, "node_modules", "onnxruntime-web", "dist");

const MODELO = "dfine_s_obj2coco.onnx";
const REVISION = "f69c4ca98cba7ca58aa15b3d4600867808fecf1b";
const URL_MODELO = `https://huggingface.co/onnx-community/dfine_s_obj2coco-ONNX/resolve/${REVISION}/onnx/model.onnx`;
const SHA256 = "b9e2e76610053aeeac3b2f1f685d8f9a1182a93a338f624b6c8cb7fb390cb532";
const cacheModelo = join(raiz, "node_modules", ".cache", "buleje-modelos", MODELO);
const destinoModelo = join(raiz, "public", "modelos", MODELO);

const hash = (ruta) => createHash("sha256").update(readFileSync(ruta)).digest("hex");

function copiarSiCambio(de, a) {
  if (existsSync(a) && statSync(a).size === statSync(de).size) return false;
  mkdirSync(dirname(a), { recursive: true });
  copyFileSync(de, a);
  return true;
}

try {
  if (!existsSync(dist)) {
    console.warn("[onnx-assets] falta node_modules/onnxruntime-web — ¿npm install incompleto?");
  } else {
    let copiados = 0;
    for (const nombre of MOTOR) if (copiarSiCambio(join(dist, nombre), join(raiz, "public", "onnxruntime", nombre))) copiados++;
    console.log(`[onnx-assets] motor: ${copiados} copiados · ${MOTOR.length - copiados} al día → public/onnxruntime/`);
  }
} catch (err) {
  console.warn(`[onnx-assets] no se pudo copiar el motor: ${err.message}`);
}

try {
  if (!existsSync(cacheModelo) || hash(cacheModelo) !== SHA256) {
    console.log("[onnx-assets] bajando D-FINE-S (41,5 MB, una sola vez)…");
    const r = await fetch(URL_MODELO, { signal: AbortSignal.timeout(300_000) });
    if (!r.ok) throw new Error(`Hugging Face respondió ${r.status}`);
    const bytes = Buffer.from(await r.arrayBuffer());
    const recibido = createHash("sha256").update(bytes).digest("hex");
    if (recibido !== SHA256) throw new Error(`hash distinto (${recibido.slice(0, 12)}…): no se guarda`);
    mkdirSync(dirname(cacheModelo), { recursive: true });
    writeFileSync(cacheModelo, bytes);
  }
  const copiado = copiarSiCambio(cacheModelo, destinoModelo);
  console.log(`[onnx-assets] modelo ${copiado ? "copiado" : "al día"} → public/modelos/${MODELO}`);
} catch (err) {
  console.warn(`[onnx-assets] sin modelo D-FINE (el mosaico usa el detector liviano): ${err.message}`);
}
