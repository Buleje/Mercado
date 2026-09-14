#!/usr/bin/env node
/**
 * barrido-modales-anidados.mjs — ¿qué AdminModal se abre desde adentro de un
 * modal escrito a mano y se queda DETRÁS?
 *
 * El bug (Brandon, 2026-09-11: «no funciona y se lagea el modal»): los modales
 * a mano del forestal se pintan en z-60 y un AdminModal (Radix) en z-50. Si el
 * segundo se abre desde el primero, se monta invisible, y como Radix apaga los
 * clics de todo el body mientras está abierto, la pantalla entera deja de
 * responder. El arreglo es la prop `aboveModals` del AdminModal.
 *
 * Este barrido sigue el grafo de imports (hasta 3 saltos) desde cada modal a
 * mano de z>50 hasta cualquier componente que use AdminModal, y marca los que
 * no piden `aboveModals`. Encontró 4 que a simple vista no se veían.
 *
 *   node scripts/barrido-modales-anidados.mjs        → «⚠ FALTA» = arreglar
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, basename } from "node:path";

/* Recorre `components/admin` ENTERO. Antes eran cinco carpetas fijas sin
   recursión: un «verde» sobre `components/admin/rrhh/**` no había mirado nada
   (revisión 2026-09-14). */
const archivos = [];
const recorrer = (d) => {
  let entradas = [];
  try { entradas = readdirSync(d, { withFileTypes: true }); } catch { return; }
  for (const e of entradas) {
    const p = join(d, e.name);
    if (e.isDirectory()) recorrer(p);
    else if (e.name.endsWith(".tsx")) archivos.push(p);
  }
};
recorrer("components/admin");
const src = new Map(archivos.map((f) => [f, readFileSync(f, "utf8")]));

const resolver = (desde, spec) => {
  // `./x` y `../carpeta/x`: los módulos por carpeta se importan entre hermanas.
  if (spec.startsWith("./") || spec.startsWith("../")) { const p = join(dirname(desde), spec + ".tsx"); return existsSync(p) ? p : null; }
  if (spec.startsWith("@/")) { const p = spec.slice(2) + ".tsx"; return existsSync(p) ? p : null; }
  return null;
};

/** hijos renderizados de verdad (importados Y con un <Tag en el archivo) */
const hijos = (f) => {
  const s = src.get(f) ?? "";
  const out = [];
  for (const m of s.matchAll(/import\s+(?:(\w+)|\{[^}]*\})[^"']*["']([^"']+)["']/g)) {
    const p = resolver(f, m[2]);
    if (!p || !src.has(p)) continue;
    const nombre = m[1] ?? basename(p, ".tsx");
    if (new RegExp(`<${nombre}[\\s/>]`).test(s)) out.push(p);
  }
  return out;
};

const usaAdminModal = (f) => /from "@\/components\/admin\/shared\/AdminModal"/.test(src.get(f) ?? "");
const yaArreglado = (f) => /aboveModals/.test(src.get(f) ?? "");
const manualAlto = (f) => /role="dialog"/.test(src.get(f) ?? "") && /z-\[(5[1-9]|[6-9]\d)\]/.test(src.get(f) ?? "");

const hallazgos = [];
for (const alto of archivos.filter(manualAlto)) {
  const visto = new Set([alto]);
  let frontera = hijos(alto);
  for (let d = 1; d <= 3 && frontera.length; d++) {
    const sig = [];
    for (const h of frontera) {
      if (visto.has(h)) continue;
      visto.add(h);
      if (usaAdminModal(h)) hallazgos.push({ alto: basename(alto), abre: basename(h), profundidad: d, ok: yaArreglado(h) });
      sig.push(...hijos(h));
    }
    frontera = sig;
  }
}
const vistos = new Set();
for (const h of hallazgos.sort((a,b)=>Number(a.ok)-Number(b.ok))) {
  const k = h.alto + h.abre; if (vistos.has(k)) continue; vistos.add(k);
  console.log(`${h.ok ? "OK " : "⚠ FALTA"}  ${h.alto} → ${h.abre} (a ${h.profundidad} salto${h.profundidad===1?"":"s"})`);
}
