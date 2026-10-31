#!/usr/bin/env node
/**
 * Copia a `public/ezuikit_static/` los decodificadores del reproductor de
 * Hik-Connect (`ezuikit-js`, ADR-471) para servirlos desde el MISMO origen.
 *
 * Por qué no el CDN que `ezuikit-js` usa por defecto
 * (`https://openstatic.ys7.com/ezuikit_js/v9.0.22/ezuikit_static`): medido el
 * 05-10, ese CDN (en China) dejó colgado el pedido de `Decoder.js` 20 s de 3
 * intentos, y el reproductor tiró «importScripts … failed to load» dentro del
 * panel. Autohospedarlo además saca un host externo de `script-src`.
 *
 * Sólo lo que el video usa: `libSystemTransformWASM.js` y `PlayCtrlWasm/**`
 * (≈16 MB). `talk/` (intercomunicador) no se copia.
 *
 * Corre en `postinstall`, igual que `copy-tesseract-assets.mjs`. Nunca falla
 * la instalación: sin estos archivos el panel arranca igual y el visor de la
 * nube dice que no pudo mostrar el video. `public/ezuikit_static/` está en
 * .gitignore (regenerable).
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const origenBase = join(raiz, "node_modules", "ezuikit-js", "ezuikit_static");
const destino = join(raiz, "public", "ezuikit_static");
const QUE = ["libSystemTransformWASM.js", "PlayCtrlWasm"];

function archivosDe(ruta) {
  if (!existsSync(ruta)) return [];
  if (statSync(ruta).isFile()) return [ruta];
  return readdirSync(ruta).flatMap((n) => archivosDe(join(ruta, n)));
}

let copiados = 0;
let alDia = 0;
try {
  if (!existsSync(origenBase)) {
    console.warn("[ezuikit-assets] falta node_modules/ezuikit-js — ¿npm install incompleto?");
  } else {
    for (const origen of QUE.flatMap((q) => archivosDe(join(origenBase, q)))) {
      const fin = join(destino, relative(origenBase, origen));
      if (existsSync(fin) && statSync(fin).size === statSync(origen).size) {
        alDia++;
        continue;
      }
      mkdirSync(dirname(fin), { recursive: true });
      copyFileSync(origen, fin);
      copiados++;
    }
  }
  console.log(`[ezuikit-assets] ${copiados} copiados · ${alDia} al día → public/ezuikit_static/`);
} catch (err) {
  console.warn(`[ezuikit-assets] no se pudo copiar (el visor de la nube no tendrá decodificador): ${err?.message ?? err}`);
}
