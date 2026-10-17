#!/usr/bin/env node
/**
 * kicker — los rótulos en mayúsculas hechos a mano (`<p className="text-[10px]
 * font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Total</p>`)
 * pasan a `<Kicker className="libro-kicker">` del DS (la escala única del panel:
 * rótulo = Kicker + libro-kicker; ADR-489).
 *
 * - Sólo HOJAS: el hijo es texto o `{expresión}`, sin etiquetas adentro. Nunca
 *   `<th>`/`<td>` (la cabecera de tabla la pone DataTable).
 * - Sólo `className="…"` literal. Con `cn(…)` o un color semántico (data-*,
 *   accent: libro-kicker pisa el color) queda «a revisar».
 * - Se van tamaño, mayúsculas, tracking, peso, interlineado y color neutro; se
 *   quedan las de ubicación (mb-1, block, truncate…). La etiqueta original va en
 *   `as` (p, div, dt, label…); `span` es la de Kicker.
 *
 *   node scripts/codemods/kicker.mjs --seco [--carpeta components/admin/forestal] [--muestra 3]
 */
import { asegurarImport, correr, esPrincipal, filtrarClases, nombreOcupado } from "./_comun.mjs";

const MODULO = "@buleje/design-system";

const HOJA = /<(p|span|div|h[3-6]|dt|dd|small|label)\b([^<>]*?)\sclassName=(?:"([^"]*)"|'([^']*)')([^<>]*?)>([^<]*)<\/\1>/g;
const SE_VA = /^(?:dark:)?(?:text-(?:xs|sm|2xs|\[length:[^\]]+\]|\[\d+px\])|uppercase|tracking-\S+|font-(?:normal|medium|semibold|bold|extrabold|black)|leading-\S+|text-\[var\(--text-(?:primary|secondary|tertiary)\)\]|text-(?:gray|neutral|slate|zinc|stone)-\d+|text-muted(?:-foreground)?)$/;
const COLOR_SEMANTICO = /\btext-(?:\[var\(--(?:data|accent)[^\]]*\)\]|(?:red|rose|amber|emerald|green|teal|sky|blue|primary)\b)/;
const ROTULO = (c) => /\buppercase\b/.test(c) && /\btracking-/.test(c);

export function transformar(texto) {
  let cambios = 0;
  const ejemplos = [];
  const nuevo = texto.replace(HOJA, (todo, tag, antes, c1, c2, despues, hijo) => {
    const clases = c1 ?? c2 ?? "";
    if (!ROTULO(clases) || !hijo.trim() || COLOR_SEMANTICO.test(clases)) return todo;
    /* Kicker tipa sus props como HTMLAttributes y su ref como <span>: htmlFor y ref, a mano. */
    if (/\b(?:htmlFor|ref)=/.test(`${antes} ${despues}`)) return todo;
    const quedan = filtrarClases(clases, (t) => !SE_VA.test(t));
    const as = tag === "span" ? "" : ` as="${tag}"`;
    const salida = `<Kicker${as}${antes} className="${["libro-kicker", quedan].filter(Boolean).join(" ")}"${despues}>${hijo}</Kicker>`;
    cambios++;
    if (ejemplos.length < 2) ejemplos.push([todo, salida]);
    return salida;
  });
  /* Lo que queda con mayúsculas + tracking (cn(…), no-hojas, <th>, colores) es para mirar a mano. */
  const rotulos = (t) => [...t.matchAll(/"[^"\n]*"|'[^'\n]*'|`[^`]*`/g)].filter((x) => ROTULO(x[0])).length;
  /* Con un `Kicker` propio en el archivo, el import chocaría: entero a mano. */
  if (cambios && nombreOcupado(texto, "Kicker", MODULO)) return { texto, cambios: 0, revisar: rotulos(texto), ejemplos: [] };
  const revisar = rotulos(nuevo);
  return {
    texto: cambios ? asegurarImport(nuevo, "Kicker", MODULO) : texto,
    cambios,
    revisar,
    ejemplos,
  };
}

if (esPrincipal(import.meta.url)) {
  process.exit(correr({ nombre: "kicker", que: "rótulos uppercase+tracking a mano (hojas) → <Kicker className=\"libro-kicker\">", transformar }));
}
