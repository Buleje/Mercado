#!/usr/bin/env node
/**
 * hex-graficos — los hex de los archivos con recharts pasan al token `--data-*`
 * más cercano (`"#00A0A0"` → `"var(--data-5)"`), que cambia solo en oscuro
 * (contrato de diseño, ADR-489; tema único en components/admin/shared/chart-palette.ts).
 *
 * - La paleta sale de app/globals.css (el tema claro: la 1.ª definición de
 *   --data-1…8 y --data-error-500), no de una copia.
 * - Sólo hex entre comillas (`"#abc"`, `'#aabbcc'`); un `var(--x, #fallback)` no se toca.
 * - Un hex lejos de todo token (distancia RGB > 60) queda «a revisar»: cambiarlo
 *   cambiaría el color que el dueño reconoce (Yape, billetes…). Con --muestra se
 *   ve cada reemplazo con su distancia.
 * - Después de aplicar: a mano, pasar los `var(--data-N)` sueltos a
 *   `COLOR_CONCEPTO.<concepto>` cuando la serie tiene uno (ventas, gastos…).
 *
 *   node scripts/codemods/hex-graficos.mjs --seco [--carpeta components/admin/analytics] [--muestra 5]
 */
import fs from "node:fs";
import path from "node:path";
import { RAIZ, correr, esPrincipal } from "./_comun.mjs";

const LEJOS = 60;

function rgb(hex) {
  let h = hex.replace("#", "");
  if (h.length === 3 || h.length === 4) h = [...h.slice(0, 3)].map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

let paletaMemo = null;
/** [{ token: "var(--data-5)", rgb: [0,160,160] }, …] desde globals.css (tema claro). */
export function paleta() {
  if (paletaMemo) return paletaMemo;
  const css = fs.readFileSync(path.join(RAIZ, "app/globals.css"), "utf8");
  const out = [];
  for (const nombre of ["1", "2", "3", "4", "5", "6", "7", "8", "error-500"]) {
    const m = css.match(new RegExp(`--data-${nombre}:\\s*(#[0-9a-fA-F]{3,8})\\s*;`));
    if (m) out.push({ token: `var(--data-${nombre})`, rgb: rgb(m[1]) });
  }
  paletaMemo = out;
  return out;
}

export function tokenMasCercano(hex) {
  const c = rgb(hex);
  let mejor = null;
  for (const p of paleta()) {
    const d = Math.hypot(c[0] - p.rgb[0], c[1] - p.rgb[1], c[2] - p.rgb[2]);
    if (!mejor || d < mejor.distancia) mejor = { token: p.token, distancia: Math.round(d) };
  }
  return mejor;
}

export function transformar(texto) {
  if (!/from\s+["']recharts["']/.test(texto)) return { texto, cambios: 0, revisar: 0 };
  let cambios = 0;
  let revisar = 0;
  const ejemplos = [];
  const nuevo = texto.replace(/(["'`])(#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3}))\1/g, (todo, q, hex) => {
    const t = tokenMasCercano(hex);
    if (!t || t.distancia > LEJOS) {
      revisar++;
      return todo;
    }
    cambios++;
    if (ejemplos.length < 3) ejemplos.push([`${hex}`, `${t.token} (distancia ${t.distancia})`]);
    return `${q}${t.token}${q}`;
  });
  return { texto: nuevo, cambios, revisar, ejemplos };
}

if (esPrincipal(import.meta.url)) {
  process.exit(correr({ nombre: "hex-graficos", que: "hex en archivos con recharts → var(--data-*) más cercano", transformar }));
}
