#!/usr/bin/env node
/**
 * modal-tamano — el ancho de un `AdminModal` se elige con `size`, no con
 * `className` (ADR-489, Brandon 2026-10-11: «un solo estilo de modal… tamaños,
 * proporciones»). Medido ese día: 46 de 274 `AdminModal` pisaban el ancho con
 * 30 valores distintos (30 a 110 rem).
 *
 * - `className="sm:max-w-[48rem]"` → `size="lg"`: cada ancho cae en el tamaño
 *   con nombre MÁS CERCANO (sm 24 · md 32 · lg 42 · xl 64 · planilla ≥ 70 rem o
 *   `w-[min(96vw,…)] max-w-none`). Se van también los `max-h-*` (los pone el
 *   tamaño); el resto de las clases se queda.
 * - Un `max-w-*` sin `sm:` en una centrada estaba MUERTO desde los 640 px (la
 *   variante trae su `sm:max-w-…` y gana): se respeta lo que quiso el autor.
 * - `variant="side"`: el cajón tiene un solo ancho; el `max-w` se va.
 * - A revisar (no se toca): `className={expresión}`, clases que cambian la
 *   forma (`h-*`, `rounded-*`), `variant` por expresión, `fullscreen`/`pos`.
 * - `--variantes`: además renombra los anchos viejos de `variant`
 *   (centered-sm → sm, default → nada, wide → lg, info → xl). Mismos píxeles.
 *
 *   node scripts/codemods/modal-tamano.mjs --seco [--carpeta components/admin/forestal] [--muestra 3] [--validar]
 */
import { createRequire } from "node:module";
import path from "node:path";
import { RAIZ, correr, esPrincipal } from "./_comun.mjs";

const ts = createRequire(path.join(RAIZ, "package.json"))("typescript");
const VARIANTES = process.argv.includes("--variantes");

const TW = {
  sm: 24,
  md: 28,
  lg: 32,
  xl: 36,
  "2xl": 42,
  "3xl": 48,
  "4xl": 56,
  "5xl": 64,
  "6xl": 72,
  "7xl": 80,
};
const ALIAS = { "centered-sm": "sm", default: "md", wide: "lg", info: "xl" };
const ANCHO = /^(?:!|sm:|md:|lg:|xl:)?(?:max-w|w|max-h)-/;
const FORMA = /^(?:!|sm:|md:|lg:)?(?:h|min-h|rounded(?:-[a-z]+)?)(?:-|$)/;

/** rem de un token de ancho, o null si no dice un ancho (max-w-none, w-full…). */
function rem(token) {
  const v = token.replace(/^(?:!|sm:|md:|lg:|xl:)/, "");
  if (/^max-h-/.test(v)) return null;
  const tw = /^max-w-([a-z0-9]+)$/.exec(v);
  if (tw) return TW[tw[1]] ?? null;
  const arb = /^(?:max-w|w)-\[(.+)\]$/.exec(v);
  if (!arb) return null;
  const nums = [...arb[1].matchAll(/([\d.]+)(rem|px)/g)].map((m) =>
    m[2] === "px" ? Number(m[1]) / 16 : Number(m[1]),
  );
  if (!nums.length) return /vw/.test(arb[1]) ? 100 : null;
  return Math.max(...nums);
}

export function tamanoDe(r) {
  if (r < 28) return "sm";
  if (r < 37) return "md";
  if (r < 53) return "lg";
  if (r < 70) return "xl";
  return "planilla";
}

/** «sm:max-w-[48rem] mx-2» → { tamano: "lg", quedan: "mx-2" } · null si no hay ancho · "revisar". */
export function leerClases(clases) {
  const toks = clases.split(/\s+/).filter(Boolean);
  const anchos = toks.filter((t) => ANCHO.test(t));
  if (!anchos.length) return null;
  if (toks.some((t) => FORMA.test(t))) return "revisar";
  const conPunto = anchos.filter((t) => /^(?:sm|md|lg|xl):/.test(t));
  const medidos = (conPunto.length ? conPunto : anchos).map(rem).filter((x) => x != null);
  const ninguno = anchos.some((t) => /max-w-none$/.test(t));
  const r = medidos.length ? Math.max(...medidos) : ninguno ? 100 : null;
  return {
    tamano: r == null ? null : tamanoDe(r),
    quedan: toks.filter((t) => !ANCHO.test(t)).join(" "),
  };
}

function literal(init, sf) {
  if (!init) return null;
  if (ts.isStringLiteral(init)) return init.text;
  if (
    ts.isJsxExpression(init) &&
    init.expression &&
    (ts.isStringLiteral(init.expression) || ts.isNoSubstitutionTemplateLiteral(init.expression))
  )
    return init.expression.text;
  return null;
}

export function transformar(texto, rel) {
  if (!rel.endsWith(".tsx") || !texto.includes("<AdminModal")) return { texto, cambios: 0 };
  const sf = ts.createSourceFile(rel, texto, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const ediciones = [];
  let revisar = 0;
  const visitar = (n) => {
    if (
      (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) &&
      n.tagName.getText(sf) === "AdminModal"
    ) {
      const attrs = Object.fromEntries(
        n.attributes.properties.filter(ts.isJsxAttribute).map((a) => [a.name.getText(sf), a]),
      );
      if (attrs.size) return;
      const vAttr = attrs.variant;
      const variant = vAttr ? literal(vAttr.initializer, sf) : "default";
      const cAttr = attrs.className;
      const clases = cAttr ? literal(cAttr.initializer, sf) : null;
      const quitar = (a) => ediciones.push([a.getFullStart(), a.end, ""]);
      let tamano = null;
      let tocado = false;
      if (cAttr) {
        if (clases == null) {
          if (/\b(?:max-w|w)-/.test(cAttr.getText(sf))) revisar++;
        } else {
          const l = leerClases(clases);
          if (
            l === "revisar" ||
            (l && (variant == null || variant === "fullscreen" || variant === "pos"))
          )
            revisar++;
          else if (l) {
            if (variant !== "side") tamano = l.tamano ?? ALIAS[variant];
            if (l.quedan) ediciones.push([cAttr.getStart(), cAttr.end, `className="${l.quedan}"`]);
            else quitar(cAttr);
            tocado = true;
          }
        }
      }
      if (!tocado && VARIANTES && variant && ALIAS[variant] && vAttr) tamano = ALIAS[variant];
      if (tamano && (tocado || VARIANTES)) {
        const attr = tamano === "md" ? "" : ` size="${tamano}"`;
        if (vAttr) ediciones.push([vAttr.getFullStart(), vAttr.end, attr]);
        else if (attr) ediciones.push([n.tagName.end, n.tagName.end, attr]);
        tocado = true;
      }
      if (tocado) ediciones.push(null);
    }
    ts.forEachChild(n, visitar);
  };
  visitar(sf);
  const cambios = ediciones.filter((e) => e === null).length;
  if (!cambios) return { texto, cambios: 0, revisar };
  let nuevo = texto;
  const reales = ediciones.filter(Boolean).sort((a, b) => b[0] - a[0]);
  for (const [ini, fin, por] of reales) nuevo = nuevo.slice(0, ini) + por + nuevo.slice(fin);
  const ejemplo = (t) => (/<AdminModal[\s\S]*?>/.exec(t)?.[0] ?? "").replace(/\s+/g, " ");
  return { texto: nuevo, cambios, revisar, ejemplos: [[ejemplo(texto), ejemplo(nuevo)]] };
}

if (esPrincipal(import.meta.url)) {
  process.exit(
    correr(
      {
        nombre: "modal-tamano",
        que: "anchos sueltos de AdminModal (className max-w/w/max-h) → size sm|md|lg|xl|planilla",
        transformar,
      },
      process.argv.slice(2).filter((a) => a !== "--variantes"),
    ),
  );
}
