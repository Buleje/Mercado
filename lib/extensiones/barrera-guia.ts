"use client";

/**
 * La barrera entre una pieza y la GTF (ADR-457 · `forestal.guia-impresa`).
 *
 * La guía es lo que se declara ante SERFOR: una pieza SÓLO AGREGA y las tres
 * copias oficiales tienen que seguir visibles pase lo que pase. La auditoría de
 * seguridad (01-10) mostró que un `@scope` armado contando llaves se rompía con
 * una `{` dentro de un texto CSS, y que aun sin escaparse, `:scope{position:fixed}`
 * o un `style=` en la hoja tapaban las copias (el PDF salía en blanco). Por eso,
 * tres capas, cada una suficiente por sí sola para lo suyo:
 *
 * 1. **Contenedor**: cada hoja va en un `<div>` con `contain:paint` +
 *    `overflow:clip` + `position:relative` + `isolation:isolate` y sin margen ni
 *    transformación, todo `!important` EN LÍNEA (le gana a cualquier regla de
 *    hoja de estilos, con o sin `@layer`). Lo que la pieza dibuje queda recortado
 *    a su caja: no puede taparle nada a las copias.
 * 2. **CSS leído con un parser de verdad** (postcss): si no parsea, se rechaza;
 *    si trae una declaración que mueve cosas (`position`, `transform`,
 *    `z-index`, desplazamientos o márgenes negativos), un selector que apunta al
 *    documento (`html`, `body`, `:root`, `.doc-*`, `.gs*`, otra pieza), un
 *    `@import`/`url()` externo o un escape `\`, se RECHAZA la pieza entera — no
 *    se «limpia»: una pieza que intenta eso tiene un bug que hay que ver.
 * 3. **HTML pasado por DOMPurify** sin `style=`, sin `on*`, sin `javascript:`
 *    (también escrito como `&#106;avascript:`), sin `<script>/<style>/<iframe>`
 *    y con imágenes sólo `data:image/…`. Si DOMPurify tuvo que sacar algo, se
 *    rechaza la pieza entera.
 *
 * Corre en el navegador (la guía se imprime ahí). Sin DOM no hay cómo
 * sanitizar: se rechaza todo, nunca se deja pasar sin revisar.
 */
import type { Root } from "postcss";

/** El estilo del contenedor de cada hoja: en línea y `!important` para que la pieza no lo pueda pisar. */
export const ESTILO_CONTENEDOR = [
  "display:flow-root",
  "position:relative",
  "inset:auto",
  "margin:0",
  "transform:none",
  "translate:none",
  "rotate:none",
  "scale:none",
  "zoom:1",
  "float:none",
  "z-index:0",
  "isolation:isolate",
  "contain:paint",
  "overflow:clip",
]
  .map((d) => `${d} !important`)
  .join(";");

export class PiezaRechazada extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = "PiezaRechazada";
  }
}

const MAX_CSS = 20_000;
const MAX_HTML_HOJA = 200_000;

// ─── CSS ─────────────────────────────────────────────────────────────────────

/** Propiedades que sacan cosas de su lugar: ninguna pieza las necesita en un papel. */
const PROP_PROHIBIDA = /^(-(webkit|moz|ms|o)-)?(position|transform|translate|rotate|scale|z-index|zoom|binding|behavior)$/i;
/** Propiedades que desplazan: se aceptan sólo con valores que se puedan leer y no sean negativos. */
const PROP_DESPLAZA = /^(-(webkit|moz|ms|o)-)?(inset(-[a-z-]+)?|top|left|right|bottom|margin(-[a-z-]+)?)$/i;
const VALOR_NEGATIVO = /(^|[\s(,])-(\d|\.\d)/;
const VALOR_NO_EVALUABLE = /\b(calc|min|max|clamp|var|env|attr)\s*\(/i;
/** Cargas externas o ejecutables escondidas en un valor. */
const VALOR_PROHIBIDO = /\b(image-set|-webkit-image-set|src|expression)\s*\(|javascript:/i;
/** Selectores que apuntan al documento oficial o a otra pieza. */
const SELECTOR_AJENO = /:root\b|(^|[\s>+~,(])(html|body)\b|\.doc-|\.gs(\b|-)|\.gtf|\.pz-|\[\s*data-pieza/i;
const AT_RULES_PERMITIDAS = new Set(["media"]);

const sinTextos = (v: string) => v.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""');

/** `url(...)` sólo con `data:`; cualquier otro (http, //, relativo) es una carga externa. */
function urlsExternas(valor: string): boolean {
  const urls = valor.match(/url\(\s*(["']?)(.*?)\1\s*\)/gi) ?? [];
  if (/url\(/i.test(valor) && urls.length === 0) return true;
  return urls.some((u) => !/^url\(\s*["']?\s*data:/i.test(u));
}

function revisarCss(root: Root): void {
  root.walkAtRules((at) => {
    if (!AT_RULES_PERMITIDAS.has(at.name.toLowerCase())) throw new PiezaRechazada(`cssExtra: @${at.name} no está permitido`);
  });
  root.walkRules((r) => {
    if (r.selector.includes("\\")) throw new PiezaRechazada("cssExtra: selector con escapes `\\`");
    if (SELECTOR_AJENO.test(r.selector)) throw new PiezaRechazada(`cssExtra: el selector «${r.selector}» apunta fuera de la hoja`);
  });
  root.walkDecls((d) => {
    const prop = d.prop.trim();
    const valor = d.value;
    if (prop.includes("\\")) throw new PiezaRechazada("cssExtra: propiedad con escapes `\\`");
    if (sinTextos(valor).includes("\\")) throw new PiezaRechazada(`cssExtra: valor con escapes en «${prop}»`);
    if (PROP_PROHIBIDA.test(prop)) throw new PiezaRechazada(`cssExtra: «${prop}» no está permitido en una hoja de pieza`);
    if (PROP_DESPLAZA.test(prop) && (VALOR_NEGATIVO.test(valor) || VALOR_NO_EVALUABLE.test(valor))) {
      throw new PiezaRechazada(`cssExtra: «${prop}: ${valor}» desplaza fuera de la hoja`);
    }
    if (VALOR_PROHIBIDO.test(valor) || urlsExternas(valor)) throw new PiezaRechazada(`cssExtra: «${prop}» carga algo de afuera`);
  });
}

/**
 * El CSS de la pieza, parseado con postcss, revisado y encerrado en
 * `@scope (.pz-<id>)`. Tira `PiezaRechazada` ante cualquier cosa que no pase.
 */
export async function cssEncerrado(css: unknown, piezaId: string): Promise<string> {
  if (css === undefined || css === "") return "";
  if (typeof css !== "string" || css.length > MAX_CSS) throw new PiezaRechazada("cssExtra no es texto o es demasiado grande");
  // `<` cerraría el `<style>` del documento (`</style>`), aunque esté dentro de un texto CSS.
  if (css.includes("<")) throw new PiezaRechazada("cssExtra no puede traer `<`");
  const postcss = (await import("postcss")).default;
  let root: Root;
  try {
    root = postcss.parse(css);
  } catch (err) {
    throw new PiezaRechazada(`cssExtra no es CSS válido: ${err instanceof Error ? err.message : String(err)}`);
  }
  root.walkComments((c) => {
    c.remove();
  });
  revisarCss(root);
  return `\n@scope (.pz-${piezaId}) {\n${root.toString()}\n}\n`;
}

// ─── HTML ────────────────────────────────────────────────────────────────────

const ETIQUETAS_PROHIBIDAS = [
  "script", "style", "link", "meta", "base", "iframe", "frame", "frameset", "object", "embed",
  "form", "input", "button", "textarea", "select", "option", "template", "svg", "math", "video", "audio",
  "source", "track", "portal", "noscript",
];

type Purificador = {
  isSupported: boolean;
  removed: unknown[];
  sanitize: (html: string, cfg: Record<string, unknown>) => string;
  addHook: (punto: "uponSanitizeAttribute", fn: (nodo: Element, data: { attrName: string; attrValue: string; keepAttr: boolean }) => void) => void;
};

let purificador: Purificador | null = null;

async function obtenerPurificador(win: Window | null): Promise<Purificador> {
  if (!win?.document) throw new PiezaRechazada("Sin DOM no se pueden revisar las hojas de una pieza");
  if (purificador) return purificador;
  const crear = (await import("dompurify")).default as unknown as (w: Window) => Purificador;
  // Instancia PROPIA: los hooks no se mezclan con los de jspdf/posthog, que usan el mismo paquete.
  const p = crear(win);
  if (!p.isSupported) throw new PiezaRechazada("DOMPurify no está disponible en este navegador");
  p.addHook("uponSanitizeAttribute", (_nodo, data) => {
    // Imágenes sólo embebidas: un `src` externo es una carga desde afuera al imprimir.
    if (data.attrName === "src" && !/^data:image\/(png|jpeg|gif|webp);base64,/i.test(data.attrValue.trim())) {
      data.keepAttr = false;
    }
  });
  purificador = p;
  return p;
}

function esMarcaForceBody(r: unknown): boolean {
  const el = (r as { element?: { nodeName?: string } } | null)?.element;
  return el?.nodeName?.toLowerCase() === "remove";
}

/** Sólo para los tests: olvida la instancia (cada test puede tener su `window`). */
export function _olvidarPurificador(): void {
  purificador = null;
}

/**
 * La hoja sanitizada, o `PiezaRechazada` si DOMPurify tuvo que sacarle algo.
 * `win = null` = sin DOM (servidor): se rechaza.
 */
export async function hojaSana(html: unknown, win: Window | null = typeof window === "undefined" ? null : window): Promise<string> {
  if (typeof html !== "string" || html.length > MAX_HTML_HOJA) throw new PiezaRechazada("la hoja no es HTML válido o es demasiado grande");
  const p = await obtenerPurificador(win);
  const limpio = p.sanitize(html, {
    USE_PROFILES: { html: true },
    // Sin esto, un `<style>` al principio cae en el <head> del parser y se
    // pierde SIN anotarse en `removed`: la pieza pasaría con la hoja cambiada.
    FORCE_BODY: true,
    FORBID_TAGS: ETIQUETAS_PROHIBIDAS,
    FORBID_ATTR: ["style", "srcset", "action", "formaction", "xlink:href", "ping"],
    ALLOW_DATA_ATTR: true,
    ALLOW_UNKNOWN_PROTOCOLS: false,
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|#|data:image\/(?:png|jpeg|gif|webp);base64,)/i,
  });
  // Con FORCE_BODY, DOMPurify antepone un `<remove>` propio y lo saca ANTES de
  // recorrer: es siempre la primera entrada de `removed` y no cuenta.
  const sacados = p.removed.filter((r, i) => !(i === 0 && esMarcaForceBody(r)));
  if (sacados.length > 0) {
    throw new PiezaRechazada(`la hoja trae HTML prohibido (${sacados.length} elemento(s) o atributo(s): style, on*, javascript:, script…)`);
  }
  return limpio;
}

/** El contenedor que recorta la hoja a su caja. El `id` viene del registro (kebab-case). */
export function hojaEnvuelta(piezaId: string, html: string): string {
  return `<div class="pz-hoja pz-${piezaId}" data-pieza="${piezaId}" style="${ESTILO_CONTENEDOR}">${html}</div>`;
}
