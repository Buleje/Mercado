#!/usr/bin/env node
/**
 * tabla-estilo — saca las clases de ESTILO que las pantallas ponen en `<th>`,
 * `<td>`, `<tr>`, `<thead>` y en el `className` de `<DataTable>` (ADR-489,
 * Brandon 2026-10-11: «un solo estilo de tabla para todos»). El estilo lo pone
 * `DataTable` (cabecera 14 px seminegrita sin mayúsculas sobre `--surface-sunken`,
 * celdas 14 px, mismo padding, raya y hover); en la celda quedan sólo:
 * alineación, ancho, `whitespace-nowrap`, `sticky`, visibilidad por ancho,
 * `font-mono`/`tabular-nums`, el peso y el color de estado de una celda (un
 * monto en rojo) y lo que lleva `!` (densidad decidida: «COMPACTA» del libro).
 *
 * Qué se va, según dónde está la etiqueta:
 *   cabecera (`<th>` de `<thead>`, `<tr>`/`<thead>` de la cabecera):
 *       letra, padding, peso, mayúsculas, tracking, color neutro, fondo, raya
 *   celda (`<td>`, `<th>` del cuerpo/pie):
 *       letra, padding, `text-[var(--text-primary)]` (ya es el de la tabla), raya
 *   fila del cuerpo (`<tr>`): raya, `hover:bg-…sunken`, `transition-colors`, letra
 *   `<DataTable className>`: letra, color neutro, `border-collapse` y los
 *       `[&_thead_th]:` de letra/mayúsculas/peso/color que pisaban el defecto
 * Las constantes de clase (`const TH = "…"`) usadas sólo en celdas se limpian
 * con la regla más prudente de sus usos.
 *
 * Sólo archivos sin `<table>` a mano (ahí no hay DataTable que reponga el
 * estilo) y fuera de las excepciones: la grilla del cubicador que imita el
 * Excel, hojas de impresión/PDF y las hojas del drive.
 *
 *   node scripts/codemods/tabla-estilo.mjs --seco [--carpeta components/admin/x] [--muestra 5] [--validar]
 *   INCLUIR_AJENOS=1 node scripts/codemods/tabla-estilo.mjs --carpeta components/admin/unified/finanzas   (Mi Plata, al final)
 */
import { correr, esPrincipal } from "./_comun.mjs";

/** No se tocan: imitan un papel o un Excel, o son la hoja del drive. */
const EXCEPCIONES = [
  /forestal\/CubicadorMadera\.tsx$/,
  /forestal\/cubicador-trozas-tabla\.tsx$/,
  /forestal\/CtpGuiaSerforHoja\.tsx$/, // la GTF en pantalla «con la forma del documento» (ADR-338)
  /(PDF|Impresion|Imprimible)[^/]*\.tsx$/,
  /documentos\/hoja\//,
];
/** Las vistas de Mi Plata las edita otro carril (11-10): se listan, no se tocan. */
export const AJENOS = [
  /components\/admin\/unified\/finanzas\//,
  /components\/admin\/PorCobrarDashboard\.tsx$/,
  /components\/admin\/por-cobrar\//,
  /components\/admin\/TreasuryDashboard\.tsx$/,
];

const VARIANTE = /^((?:[a-z0-9-]+:)*)(!?)(.+?)(!?)$/;
const LETRA = /^text-(?:2xs|xs|sm|base|lg|xl|\[(?:length:)?(?:var\(--ts-[^\]]*|[\d.]+(?:px|rem))\])$/;
const PADDING = /^p[xy]?-(?:\d+(?:\.\d+)?|px|\[[^\]]+\])$/;
const PESO = /^font-(?:thin|light|normal|medium|semibold|bold|extrabold|black)$/;
const CAJA = /^(?:uppercase|normal-case|tracking-.+)$/;
const COLOR_NEUTRO = /^text-(?:\[var\(--text-(?:primary|secondary|tertiary)\)\]|primary|secondary|muted|gray-\d+|neutral-\d+|slate-\d+)$/;
const FONDO = /^bg-\[var\(--surface-(?:sunken|raised|canvas)\)\](?:\/\d+)?$/;
const RAYA = /^border-[tb]$/;
/** En la cabecera también la raya gruesa: la pone DataTable (una para todas). */
const RAYA_CAB = /^border-[tb](?:-\d)?$/;
const COLOR_RAYA = /^border-\[var\(--rule-(?:soft|base|strong)\)\](?:\/\d+)?$/;
const ANCHO_RAYA = /^border(?:-[lrxytb])?(?:-\d+)?$/;

/** ¿Este token se va en este lugar? */
function seVa(tok, lugar) {
  const m = tok.match(VARIANTE);
  if (!m) return false;
  const [, variantes, imp1, base, imp2] = m;
  if (imp1 || imp2) return false; // `!` = decisión de densidad: queda
  const v = variantes;
  /* Interacción (hover del orden, foco) y grupos: quedan, salvo el hover de fila. */
  if (/(?:^|:)(?:hover|focus|group-hover|aria-[^:]+|data-[^:]+|print):$/.test(v) && !(lugar === "fila" && /hover:$/.test(v) && FONDO.test(base))) return false;
  const sinVariante = !v || /^(?:(?:dark|sm|md|lg|xl|2xl):)+$/.test(v);
  if (!sinVariante && !(lugar === "fila" && /hover:$/.test(v))) return false;
  switch (lugar) {
    case "cab":
      return LETRA.test(base) || PADDING.test(base) || PESO.test(base) || CAJA.test(base) || COLOR_NEUTRO.test(base) || FONDO.test(base) || RAYA_CAB.test(base) || base === "text-left";
    case "filaCab":
      return LETRA.test(base) || PESO.test(base) || CAJA.test(base) || COLOR_NEUTRO.test(base) || FONDO.test(base) || RAYA_CAB.test(base) || base === "text-left";
    case "cel":
      return LETRA.test(base) || PADDING.test(base) || base === "text-[var(--text-primary)]" || RAYA.test(base);
    case "fila":
      return RAYA.test(base) || /^last:border-(?:0|b-0|none)$/.test(tok) || (v === "hover:" && FONDO.test(base)) || base === "transition-colors" || LETRA.test(base);
    case "tabla":
      return LETRA.test(base) || COLOR_NEUTRO.test(base) || base === "border-collapse";
    default:
      return false;
  }
}

/** `[&_thead_th]:text-sm!` y compañía en el className de DataTable. */
function seVaDeLaTabla(tok) {
  const m = tok.match(/^\[&_(thead_th|th|thead_tr|tbody_td|td)\]:(!?)(.+?)(!?)$/);
  if (!m) return seVa(tok, "tabla");
  const base = m[3];
  if (m[1] === "tbody_td" || m[1] === "td") return LETRA.test(base);
  return LETRA.test(base) || CAJA.test(base) || PESO.test(base) || COLOR_NEUTRO.test(base);
}

function limpiar(clases, lugar) {
  const toks = clases.split(/\s+/).filter(Boolean);
  const quedan = toks.filter((t) => !(lugar === "tabla" ? seVaDeLaTabla(t) : seVa(t, lugar)));
  /* Un color de raya sin raya no hace daño; una raya sin su color sale en
     currentColor (Tailwind 4): si queda un ancho de borde, el color se queda. */
  const conBorde = quedan.some((t) => ANCHO_RAYA.test(t.replace(VARIANTE, "$3")));
  const final = conBorde
    ? toks.filter((t) => quedan.includes(t) || COLOR_RAYA.test(t.replace(VARIANTE, "$3")))
    : quedan.filter((t) => lugar === "tabla" || !COLOR_RAYA.test(t.replace(VARIANTE, "$3")));
  return { texto: final.join(" "), quitadas: toks.length - final.length };
}

/** Fin de la etiqueta de apertura que empieza en `i` (respeta llaves y comillas). */
function finDeEtiqueta(s, i) {
  let prof = 0;
  let q = null;
  for (let k = i + 1; k < s.length; k++) {
    const c = s[k];
    if (q) {
      if (c === "\\") k++;
      else if (c === q) q = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") q = c;
    else if (c === "{") prof++;
    else if (c === "}") prof--;
    else if (c === ">" && prof === 0) return k;
  }
  return -1;
}

/** Cierre de la llave que abre en `i`. */
function cierreDeLlave(s, i) {
  let prof = 0;
  let q = null;
  for (let k = i; k < s.length; k++) {
    const c = s[k];
    if (q) {
      if (c === "\\") k++;
      else if (q === "`" && c === "$" && s[k + 1] === "{") {
        const fin = cierreDeLlave(s, k + 1);
        if (fin < 0) return -1;
        k = fin;
      } else if (c === q) q = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") q = c;
    else if (c === "{") prof++;
    else if (c === "}" && --prof === 0) return k;
  }
  return -1;
}

/** Limpia las partes fijas de un template literal (lo de `${…}` queda igual). */
function limpiarTemplate(tpl, lugar, usos) {
  let out = "";
  let quitadas = 0;
  let k = 1;
  let fijo = "";
  const volcar = (cierra) => {
    /* Sólo los tokens enteros: uno pegado a un `${` no se toca. */
    const pegadoIzq = out.endsWith("}") && fijo && !/^\s/.test(fijo);
    const pegadoDer = !cierra && fijo && !/\s$/.test(fijo);
    const partes = fijo.split(/(\s+)/);
    const res = partes.map((p, idx) => {
      if (!p || /^\s+$/.test(p)) return p;
      if ((idx === 0 && pegadoIzq) || (idx === partes.length - 1 && pegadoDer)) return p;
      const r = limpiar(p, lugar);
      quitadas += r.quitadas;
      return r.texto;
    });
    out += res.join("").replace(/\s{2,}/g, " ");
    fijo = "";
  };
  while (k < tpl.length - 1) {
    if (tpl[k] === "$" && tpl[k + 1] === "{") {
      volcar(false);
      const fin = cierreDeLlave(tpl, k + 1);
      const expr = tpl.slice(k, fin + 1);
      const id = expr.match(/^\$\{\s*([A-Za-z_$][\w$]*)\s*\}$/);
      if (id && usos) usos.push(id[1]);
      out += expr;
      k = fin + 1;
    } else {
      fijo += tpl[k];
      k++;
    }
  }
  volcar(true);
  return { texto: "`" + out.replace(/^\s+|\s+$/g, "") + "`", quitadas };
}

/** Reescribe el atributo className de una etiqueta. Devuelve la etiqueta nueva. */
function reescribirEtiqueta(tag, lugar, usos) {
  const i = tag.search(/\sclassName=/);
  if (i < 0) return { tag, quitadas: 0 };
  const ini = i + " className=".length;
  const c = tag[ini];
  let fin;
  let nuevo;
  let quitadas = 0;
  if (c === '"') {
    fin = tag.indexOf('"', ini + 1);
    const r = limpiar(tag.slice(ini + 1, fin), lugar);
    quitadas = r.quitadas;
    nuevo = r.texto ? `"${r.texto}"` : null;
  } else if (c === "{") {
    fin = cierreDeLlave(tag, ini);
    const dentro = tag.slice(ini + 1, fin).trim();
    if (/^"[^"]*"$/.test(dentro)) {
      const r = limpiar(dentro.slice(1, -1), lugar);
      quitadas = r.quitadas;
      nuevo = r.texto ? `"${r.texto}"` : null;
    } else if (/^`[\s\S]*`$/.test(dentro)) {
      const r = limpiarTemplate(dentro, lugar, usos);
      quitadas = r.quitadas;
      nuevo = r.texto === "``" ? null : `{${r.texto}}`;
    } else if (/^(?:cn|clsx|cx)\(\s*"/.test(dentro)) {
      /* Sólo el primer argumento (las clases base); los condicionales son estado. */
      const m = dentro.match(/^((?:cn|clsx|cx)\(\s*)"([^"]*)"/);
      const r = limpiar(m[2], lugar);
      quitadas = r.quitadas;
      nuevo = `{${m[1]}"${r.texto}"${dentro.slice(m[0].length)}}`;
    } else {
      const id = dentro.match(/^[A-Za-z_$][\w$]*$/);
      if (id && usos) usos.push(id[0]);
      return { tag, quitadas: 0 };
    }
  } else return { tag, quitadas: 0 };
  if (!quitadas) return { tag, quitadas: 0 };
  const antes = tag.slice(0, i);
  const despues = tag.slice(fin + 1);
  return { tag: nuevo === null ? antes + despues : `${antes} className=${nuevo}${despues}`, quitadas };
}

function sinComentarios(t) {
  return t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
}

export function transformar(texto, rel = "x.tsx") {
  if (!rel.endsWith(".tsx")) return { texto, cambios: 0, revisar: 0 };
  if (!/<(?:th|td|tr|thead|DataTable)\b/.test(texto)) return { texto, cambios: 0, revisar: 0 };
  if (EXCEPCIONES.some((re) => re.test(rel)) || (!process.env.INCLUIR_AJENOS && AJENOS.some((re) => re.test(rel)))) return { texto, cambios: 0, revisar: 0 };
  const codigo = sinComentarios(texto);
  /* Una <table> a mano no tiene quién le reponga el estilo: primero `datatable.mjs`. */
  if (/<table[\s>]/.test(codigo) && /<table\s+(?:className|aria-|style|ref|role|id)|<table>\s*$/m.test(codigo)) {
    return { texto, cambios: 0, revisar: 1 };
  }
  const hayTd = /<td\b/.test(codigo);
  let estado = hayTd ? "cuerpo" : "cabecera";
  const re = /<(\/?)(thead|tbody|tfoot|th|td|tr|DataTable)\b/g;
  let out = "";
  let ult = 0;
  let cambios = 0;
  const ejemplos = [];
  const usosPorId = new Map();
  let m;
  while ((m = re.exec(texto))) {
    const [, cierra, nombre] = m;
    if (cierra) {
      if (nombre === "thead") estado = "cuerpo";
      continue;
    }
    if (nombre === "thead") estado = "cabecera";
    else if (nombre === "tbody" || nombre === "tfoot") estado = "cuerpo";
    const fin = finDeEtiqueta(texto, m.index);
    if (fin < 0) continue;
    const lugar =
      nombre === "DataTable" ? "tabla"
      : nombre === "thead" ? "filaCab"
      : nombre === "tr" ? (estado === "cabecera" ? "filaCab" : "fila")
      : nombre === "th" && estado === "cabecera" ? "cab"
      : nombre === "tbody" || nombre === "tfoot" ? null
      : "cel";
    if (!lugar) continue;
    const usos = [];
    const tag = texto.slice(m.index, fin + 1);
    const r = reescribirEtiqueta(tag, lugar, usos);
    for (const id of usos) usosPorId.set(id, [...(usosPorId.get(id) ?? []), lugar]);
    if (r.quitadas) {
      out += texto.slice(ult, m.index) + r.tag;
      ult = fin + 1;
      cambios += 1;
      if (ejemplos.length < 2) ejemplos.push([tag, r.tag]);
    }
    re.lastIndex = fin + 1;
  }
  let nuevo = out + texto.slice(ult);
  /* Constantes de clase de las celdas (`const TH = "…"`), con la regla más prudente. */
  for (const [id, lugares] of usosPorId) {
    const unicos = [...new Set(lugares)];
    if (unicos.includes("tabla")) continue;
    const lugar = unicos.length === 1 ? unicos[0] : unicos.every((l) => l === "cab" || l === "cel") ? "cel" : null;
    if (!lugar) continue;
    const def = new RegExp(`(const\\s+${id.replace(/\$/g, "\\$")}\\s*=\\s*)"([^"]*)"`);
    const d = nuevo.match(def);
    if (!d) continue;
    /* Usada fuera de una celda (un div, un span): no se toca. */
    const usosTotales = (sinComentarios(nuevo).match(new RegExp(`\\b${id.replace(/\$/g, "\\$")}\\b`, "g")) || []).length - 1;
    if (usosTotales > lugares.length) continue;
    const r = limpiar(d[2], lugar);
    if (!r.quitadas) continue;
    nuevo = nuevo.replace(def, `$1"${r.texto}"`);
    cambios += 1;
    if (ejemplos.length < 2) ejemplos.push([d[0], `${d[1]}"${r.texto}"`]);
  }
  return { texto: nuevo, cambios, revisar: 0, ejemplos };
}

if (esPrincipal(import.meta.url)) {
  process.exit(correr({ nombre: "tabla-estilo", que: "clases de estilo de th/td/tr y del className de DataTable → el defecto de DataTable", transformar }));
}
