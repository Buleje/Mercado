/**
 * croquis-desde-pdf — del PDF del plano a los componentes del croquis (ADR-465).
 *
 * Brandon dibuja su plano (lámina con ejes en metros, componentes numerados en
 * círculos y una leyenda «1 Cerco de madera…»). Al importarlo, el servidor saca
 * los TEXTOS de la página 1 con su posición (pdf.js) y esta función, pura y sin
 * pdf.js, decide:
 *
 *  1. La ESCALA: los números de los ejes (0, 5, 10… en fila; 0, 5, 10… en
 *     columna) dan metro ↔ punto de la hoja. Sin ejes, la hoja entera es el
 *     terreno (como una imagen: sus esquinas son (0,0) y (ancho, largo)).
 *  2. Las MEDIDAS: «54 × 48 m» escrito en la lámina, o las cotas «~54 m» (la
 *     acostada es el ancho; la parada, el largo), o lo que ya estaba tipeado.
 *  3. La LEYENDA: la columna más larga de renglones «número + nombre».
 *  4. Dónde está cada componente: los números sueltos del plano que estén en
 *     la leyenda. Un número que aparece varias veces da varios puntos («Madera
 *     apilada (3 puntos)»); si alguno tiene otro tamaño de letra que los
 *     números de una sola aparición, queda sin marcar (suele ser el rótulo de
 *     una ruta).
 *
 * Las posiciones salen como FRACCIÓN de la imagen recortada (origen abajo a la
 * izquierda): la pantalla las pasa a metros con el ancho/largo final, así la
 * zona cae donde está dibujada aunque Brandon corrija las medidas.
 *
 *  5. El CONTORNO de cada uno: si el PDF trae trazados (rectángulos, polígonos),
 *     el que encierra o toca su número (`croquis-pdf-contornos.ts`); si no, una
 *     marca cuadrada en su lugar.
 *
 * Límites: un PDF escaneado no trae textos ni trazados (solo queda el fondo);
 * números convertidos a curvas tampoco se leen.
 */

import type { CategoriaComponente, ComponenteZona, MaquinaPlanta, ZonaTipo } from "@/lib/forestal/planta-zona-types";
import { categoriaDeNombre, numeroDeCodigo, tipoDeComponente } from "./croquis-componentes";
import { areaContornoM2, elegirContornos, type ContornoDe, type TrazadoPdf } from "./croquis-pdf-contornos";

/** Un texto del PDF en puntos de la hoja: origen arriba a la izquierda, y hacia abajo; (x, y) = inicio de la línea base. */
export interface TextoPdf { str: string; x: number; y: number; w: number; h: number; angulo?: number }
export interface HojaPdf { ancho: number; alto: number }
export interface RectHoja { x: number; y: number; w: number; h: number }

export interface ComponentePdf {
  /** Estable dentro de la propuesta: `${numero}:${punto}`. */
  clave: string;
  numero: number;
  nombre: string;
  /** Qué es según la leyenda (madera, maquinaria, techo…): de ahí sale el `tipo` sugerido. */
  categoria: CategoriaComponente;
  tipo: ZonaTipo;
  /** Fracción de la imagen recortada (0…1), origen abajo a la izquierda. */
  fx: number;
  fy: number;
  punto: number;
  puntos: number;
  /** Marcado de entrada. */
  sugerido: boolean;
  /** El número cae fuera del terreno: se pone en el borde. */
  fuera: boolean;
  /** Contorno del plano (fracción de la imagen, origen abajo a la izquierda) o null = marca cuadrada. */
  contorno: [number, number][] | null;
  contornoDe: ContornoDe | null;
  /** Otros números marcados que quedan dentro de su contorno. */
  encierra: number[];
}

export interface MaquinaPdf { codigo: string; nombre: string | null; fx: number; fy: number }

export interface PropuestaCroquisPdf {
  escaneado: boolean;
  escala: "ejes" | "hoja";
  anchoM: number | null;
  altoM: number | null;
  medidasDe: "texto" | "cotas" | "pista" | "ejes" | null;
  /** Lo que se recorta de la hoja para el fondo (puntos de la hoja). */
  recorte: RectHoja;
  leyenda: number;
  componentes: ComponentePdf[];
  sinUbicar: { numero: number; nombre: string }[];
  maquinas: MaquinaPdf[];
  avisos: string[];
  /** Trazados cerrados del plano que sirven de contorno (0 = PDF sin dibujos vectoriales). */
  trazados: number;
  /** El fondo en chico (data URL WebP) para la vista previa de la revisión; lo pone el servidor. */
  vistaPrevia?: string;
}

// ─── Tipo y código sugeridos ───────────────────────────────────────────────

/**
 * El tipo sale de la CATEGORÍA del renglón (`croquis-componentes.ts`): «Acopio
 * de trozas para el coche» es madera → patio de trozas, no aserrado.
 */
export function tipoSugerido(nombre: string): ZonaTipo {
  return tipoDeComponente(categoriaDeNombre(nombre), nombre);
}

/** Prefijo del código por tipo (el de las zonas sembradas: PT-08, AS-36, PP-30…). */
export const PREFIJO_TIPO: Record<ZonaTipo, string> = {
  entrada: "EN", patio_trozas: "PT", aserrado: "AS", secado: "SC", patio_producto: "PP",
  reserva: "RS", despacho: "DS", oficina: "OF", otro: "OT",
};

/** Vive en el catálogo de componentes; se re-exporta para no romper a quien lo importa de acá. */
export { numeroDeCodigo };

// ─── Geometría de textos ───────────────────────────────────────────────────

const RE_NUM = /^\d{1,4}(?:[.,]\d+)?$/;
const valor = (s: string) => Number(s.replace(",", "."));
const horizontal = (t: TextoPdf) => Math.abs(t.angulo ?? 0) < 8;
const parado = (t: TextoPdf) => Math.abs(Math.abs(t.angulo ?? 0) - 90) < 8;
const cx = (t: TextoPdf) => t.x + t.w / 2;
/** Centro vertical del dígito: la altura de un número es ~0,72 del cuerpo. */
const cy = (t: TextoPdf) => t.y - t.h * 0.36;
const r1 = (n: number) => Math.round(n * 10) / 10;
const r4 = (n: number) => Math.round(n * 10_000) / 10_000;
const mediana = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

interface Segmento { items: TextoPdf[]; texto: string }

/** Renglones (misma línea base) partidos donde hay un hueco grande: cada pedazo es un rótulo. */
function segmentos(textos: TextoPdf[]): Segmento[] {
  const hs = textos.filter((t) => horizontal(t) && t.str.trim()).sort((a, b) => a.y - b.y || a.x - b.x);
  const lineas: TextoPdf[][] = [];
  for (const t of hs) {
    const l = lineas[lineas.length - 1];
    if (l && Math.abs(l[0].y - t.y) <= 0.45 * Math.max(l[0].h, t.h)) l.push(t);
    else lineas.push([t]);
  }
  const segs: Segmento[] = [];
  for (const l of lineas) {
    l.sort((a, b) => a.x - b.x);
    let actual: TextoPdf[] = [];
    for (const t of l) {
      const prev = actual[actual.length - 1];
      if (prev && t.x - (prev.x + prev.w) > 2.5 * Math.max(prev.h, t.h)) { segs.push(armar(actual)); actual = []; }
      actual.push(t);
    }
    if (actual.length) segs.push(armar(actual));
  }
  return segs;
}

const centroSeg = (s: Segmento) => (s.items[0].x + s.items[s.items.length - 1].x + s.items[s.items.length - 1].w) / 2;

function armar(items: TextoPdf[]): Segmento {
  let texto = "";
  items.forEach((t, i) => {
    const prev = items[i - 1];
    texto += (prev && t.x - (prev.x + prev.w) > 0.15 * t.h ? " " : "") + t.str.trim();
  });
  return { items, texto: texto.trim() };
}

// ─── Ejes ──────────────────────────────────────────────────────────────────

/** metros = a · posición + b (posición en puntos de la hoja). */
interface Ajuste { a: number; b: number; ticks: TextoPdf[]; max: number }

function ajustar(ticks: TextoPdf[], pos: (t: TextoPdf) => number): Ajuste {
  const ps = ticks.map(pos), vs = ticks.map((t) => valor(t.str));
  const mp = ps.reduce((s, p) => s + p, 0) / ps.length, mv = vs.reduce((s, v) => s + v, 0) / vs.length;
  let cov = 0, vari = 0;
  ps.forEach((p, i) => { cov += (p - mp) * (vs[i] - mv); vari += (p - mp) ** 2; });
  const a = cov / vari;
  return { a, b: mv - a * mp, ticks, max: Math.max(...vs) };
}

/**
 * La corrida más larga de números en progresión aritmética y a paso parejo
 * dentro de un grupo alineado. `signo` = hacia dónde crece el valor con la
 * posición (+1 eje X; −1 eje Y, porque la hoja crece hacia abajo).
 */
function corrida(grupo: TextoPdf[], pos: (t: TextoPdf) => number, signo: 1 | -1): TextoPdf[] {
  const g = [...grupo].sort((a, b) => pos(a) - pos(b));
  let mejor: TextoPdf[] = [];
  for (let i = 0; i < g.length; i++) {
    for (let j = i + 1; j < g.length; j++) {
      const dv = valor(g[j].str) - valor(g[i].str), dp = pos(g[j]) - pos(g[i]);
      if (dp <= 0 || Math.sign(dv) !== signo) continue;
      const run = [g[i], g[j]];
      let k = j;
      for (;;) {
        const ult = run[run.length - 1];
        const sig = g.slice(k + 1).findIndex((t) => Math.abs(pos(t) - pos(ult) - dp) <= 0.25 * dp && Math.abs(valor(t.str) - valor(ult.str) - dv) < 1e-6);
        if (sig < 0) break;
        k = k + 1 + sig;
        run.push(g[k]);
      }
      if (run.length > mejor.length) mejor = run;
    }
  }
  return mejor;
}

function agrupar(items: TextoPdf[], clave: (t: TextoPdf) => number, tol: (t: TextoPdf) => number): TextoPdf[][] {
  const s = [...items].sort((a, b) => clave(a) - clave(b));
  const grupos: TextoPdf[][] = [];
  for (const t of s) {
    const g = grupos[grupos.length - 1];
    if (g && Math.abs(clave(t) - clave(g[0])) <= tol(t)) g.push(t);
    else grupos.push([t]);
  }
  return grupos;
}

function mejorEje(grupos: TextoPdf[][], pos: (t: TextoPdf) => number, signo: 1 | -1): TextoPdf[] {
  let mejor: TextoPdf[] = [];
  for (const g of grupos) {
    if (g.length < 4) continue;
    const r = corrida(g, pos, signo);
    const span = (x: TextoPdf[]) => (x.length ? Math.abs(pos(x[x.length - 1]) - pos(x[0])) : 0);
    if (r.length > mejor.length || (r.length === mejor.length && span(r) > span(mejor))) mejor = r;
  }
  return mejor.length >= 4 ? mejor : [];
}

function detectarEjes(numeros: TextoPdf[]): { x: Ajuste; y: Ajuste } | null {
  const filas = agrupar(numeros, (t) => t.y, (t) => Math.max(1.5, 0.3 * t.h));
  const ex = mejorEje(filas, cx, 1);
  const porDerecha = agrupar(numeros, (t) => t.x + t.w, (t) => Math.max(2, 0.3 * t.h));
  const porCentro = agrupar(numeros, cx, (t) => Math.max(2, 0.3 * t.h));
  const a = mejorEje(porDerecha, cy, -1), b = mejorEje(porCentro, cy, -1);
  const ey = a.length >= b.length ? a : b;
  if (!ex.length || !ey.length) return null;
  return { x: ajustar(ex, cx), y: ajustar(ey, cy) };
}

// ─── Medidas del terreno ───────────────────────────────────────────────────

const enRango = (n: number) => Number.isFinite(n) && n >= 5 && n <= 2000;

function medidasDeTexto(segs: Segmento[], textos: TextoPdf[]): { anchoM: number; altoM: number; de: "texto" | "cotas" } | null {
  let mejor: { anchoM: number; altoM: number } | null = null;
  for (const s of segs) {
    for (const m of s.texto.matchAll(/(\d+(?:[.,]\d+)?)\s*[×xX]\s*(\d+(?:[.,]\d+)?)\s*m\b/g)) {
      const an = valor(m[1]), al = valor(m[2]);
      if (enRango(an) && enRango(al) && (!mejor || an * al > mejor.anchoM * mejor.altoM)) mejor = { anchoM: an, altoM: al };
    }
  }
  if (mejor) return { ...mejor, de: "texto" };
  const cota = (t: TextoPdf) => { const m = /^~?\s*(\d+(?:[.,]\d+)?)\s*m\b/.exec(t.str.trim()); return m ? valor(m[1]) : NaN; };
  const acostadas = segs.map((s) => cota({ ...s.items[0], str: s.texto })).filter(enRango);
  const paradas = textos.filter(parado).map(cota).filter(enRango);
  if (acostadas.length && paradas.length) return { anchoM: Math.max(...acostadas), altoM: Math.max(...paradas), de: "cotas" };
  return null;
}

// ─── Leyenda ───────────────────────────────────────────────────────────────

interface Renglon { numero: number; nombre: string; item: TextoPdf; seg: Segmento }

/** Columnas de renglones «número + nombre». La más larga es la leyenda; las otras de ≥ 3 que no repitan números, también. */
function leyenda(segs: Segmento[]): { mapa: Map<number, string>; enListas: Set<TextoPdf> } {
  const renglones: Renglon[] = [];
  for (const seg of segs) {
    const m = /^(\d{1,3})(?:\s*[.)\-–:])?\s*([\p{L}«"(].*)$/u.exec(seg.texto);
    if (m && /\p{L}/u.test(m[2])) {
      renglones.push({ numero: Number(m[1]), nombre: m[2].trim().replace(/[.\s]+$/, ""), item: seg.items[0], seg });
    }
  }
  const porItem = new Map(renglones.map((r) => [r.item, r]));
  const columnas = [
    ...agrupar(renglones.map((r) => r.item), cx, (t) => Math.max(3, 0.5 * t.h)),
    ...agrupar(renglones.map((r) => r.item), (t) => t.x, (t) => Math.max(3, 0.5 * t.h)),
  ].filter((c) => c.length >= 3).sort((a, b) => b.length - a.length);
  const mapa = new Map<number, string>();
  const enListas = new Set<TextoPdf>();
  for (const col of columnas) {
    const rs = col.map((t) => porItem.get(t)!).sort((a, b) => a.item.y - b.item.y);
    // Toda columna de renglones numerados es una LISTA (leyenda o pasos del proceso): sus números no son marcas del plano.
    rs.forEach((r) => enListas.add(r.item));
    if (rs.some((r) => mapa.has(r.numero))) continue;
    for (const r of rs) if (!mapa.has(r.numero)) mapa.set(r.numero, r.nombre);
  }
  return { mapa, enListas };
}

// ─── Propuesta ─────────────────────────────────────────────────────────────

const RE_MAQ = /\bD(\d{1,2})\s+(\p{L}[^·|,;/]*?)\s*(?=[·|,;/]|\bD\d|$)/gu;

export function proponerCroquisDesdePdf(entrada: {
  textos: TextoPdf[];
  hoja: HojaPdf;
  pista?: { anchoM: number; altoM: number } | null;
  /** Polígonos pintados de la página, en puntos de la hoja (`trazadosDeOperadores`). */
  trazados?: TrazadoPdf[];
}): PropuestaCroquisPdf {
  const hoja = { ancho: Math.max(1, entrada.hoja.ancho), alto: Math.max(1, entrada.hoja.alto) };
  const textos = entrada.textos.filter((t) => t.str.trim() && Number.isFinite(t.x) && Number.isFinite(t.y) && t.h > 0);
  const avisos: string[] = [];
  const hojaEntera: RectHoja = { x: 0, y: 0, w: hoja.ancho, h: hoja.alto };
  const caracteres = textos.reduce((n, t) => n + t.str.replace(/\s/g, "").length, 0);
  if (caracteres < 3) {
    const p = entrada.pista && enRango(entrada.pista.anchoM) && enRango(entrada.pista.altoM) ? entrada.pista : null;
    return {
      escaneado: true, escala: "hoja", anchoM: p?.anchoM ?? null, altoM: p?.altoM ?? null, medidasDe: p ? "pista" : null,
      recorte: hojaEntera, leyenda: 0, componentes: [], sinUbicar: [], maquinas: [], trazados: 0,
      avisos: ["El PDF es una imagen escaneada: no trae textos. Quedó solo el fondo; los componentes se marcan a mano."],
    };
  }

  const segs = segmentos(textos);
  const { mapa, enListas } = leyenda(segs);
  const numeros = textos.filter((t) => horizontal(t) && RE_NUM.test(t.str.trim()) && !enListas.has(t));
  const ejes = detectarEjes(numeros);
  const deTexto = medidasDeTexto(segs, textos);

  let anchoM: number | null = null, altoM: number | null = null;
  let medidasDe: PropuestaCroquisPdf["medidasDe"] = null;
  if (deTexto) {
    anchoM = deTexto.anchoM; altoM = deTexto.altoM; medidasDe = deTexto.de;
  } else if (entrada.pista && enRango(entrada.pista.anchoM) && enRango(entrada.pista.altoM)) {
    anchoM = entrada.pista.anchoM; altoM = entrada.pista.altoM; medidasDe = "pista";
  } else if (ejes && enRango(ejes.x.max) && enRango(ejes.y.max)) {
    anchoM = ejes.x.max; altoM = ejes.y.max; medidasDe = "ejes";
    avisos.push("La lámina no dice el ancho y el largo: tomé el último número de cada eje. Corrígelos si el terreno sigue más allá.");
  }

  let recorte = hojaEntera;
  let escala: PropuestaCroquisPdf["escala"] = "hoja";
  if (ejes && anchoM != null && altoM != null) {
    escala = "ejes";
    const x0 = -ejes.x.b / ejes.x.a, x1 = (anchoM - ejes.x.b) / ejes.x.a;
    const y0 = -ejes.y.b / ejes.y.a, y1 = (altoM - ejes.y.b) / ejes.y.a;
    const izq = Math.max(0, Math.min(x0, x1)), der = Math.min(hoja.ancho, Math.max(x0, x1));
    const arr = Math.max(0, Math.min(y0, y1)), aba = Math.min(hoja.alto, Math.max(y0, y1));
    recorte = { x: izq, y: arr, w: der - izq, h: aba - arr };
    if (Math.abs(der - izq - Math.abs(x1 - x0)) > 1 || Math.abs(aba - arr - Math.abs(y1 - y0)) > 1) {
      anchoM = r1(Math.abs(ejes.x.a) * recorte.w); altoM = r1(Math.abs(ejes.y.a) * recorte.h);
      avisos.push(`El terreno se sale de la hoja: lo recorté al borde (${anchoM} × ${altoM} m).`);
    }
    const ratio = Math.abs(ejes.x.a / ejes.y.a);
    if (ratio < 0.85 || ratio > 1.15) avisos.push("Los ejes no tienen la misma escala (el plano está estirado): revisa las medidas.");
  } else if (!ejes) {
    avisos.push("No encontré los ejes en metros: tomé la hoja entera como el terreno. Si el PDF tiene márgenes o leyenda, recórtalo al cerco antes de exportarlo.");
  }

  const frac = (t: TextoPdf) => ({ fx: (cx(t) - recorte.x) / recorte.w, fy: (recorte.y + recorte.h - cy(t)) / recorte.h });
  const margen = { x: escala === "ejes" && anchoM ? Math.min(4 / anchoM, 0.08) : 0, y: escala === "ejes" && altoM ? Math.min(4 / altoM, 0.08) : 0 };
  const dentro = (t: TextoPdf) => {
    const { fx, fy } = frac(t);
    return fx >= -margen.x && fx <= 1 + margen.x && fy >= -margen.y && fy <= 1 + margen.y;
  };
  const ticks = new Set(ejes ? [...ejes.x.ticks, ...ejes.y.ticks] : []);
  const pegadoAPalabra = (t: TextoPdf) =>
    textos.some((o) => o !== t && horizontal(o) && Math.abs(o.y - t.y) <= 0.3 * t.h && t.x - (o.x + o.w) >= -0.5 && t.x - (o.x + o.w) < 0.4 * t.h && /\p{L}$/u.test(o.str.trim()));

  // Marcas del plano: números sueltos que están en la leyenda.
  const marcas = numeros.filter((t) => /^\d{1,3}$/.test(t.str.trim()) && mapa.has(Number(t.str.trim())) && !ticks.has(t) && dentro(t) && !pegadoAPalabra(t));
  const porNumero = new Map<number, TextoPdf[]>();
  for (const t of marcas) {
    const n = Number(t.str.trim());
    porNumero.set(n, [...(porNumero.get(n) ?? []), t]);
  }
  const h0 = mediana([...porNumero.values()].filter((l) => l.length === 1).map((l) => l[0].h));
  const componentes: ComponentePdf[] = [];
  const textoDe = new Map<string, TextoPdf>();
  for (const [numero, lista] of [...porNumero.entries()].sort((a, b) => a[0] - b[0])) {
    const nombre = mapa.get(numero)!;
    const orden = lista.map((t) => ({ t, ...frac(t) })).sort((a, b) => b.fy - a.fy || a.fx - b.fx);
    orden.forEach(({ t, fx, fy }, i) => {
      const fuera = fx < 0 || fx > 1 || fy < 0 || fy > 1;
      textoDe.set(`${numero}:${i + 1}`, t);
      componentes.push({
        clave: `${numero}:${i + 1}`, numero, nombre, categoria: categoriaDeNombre(nombre), tipo: tipoSugerido(nombre),
        fx: r4(Math.min(1, Math.max(0, fx))), fy: r4(Math.min(1, Math.max(0, fy))),
        punto: i + 1, puntos: lista.length,
        sugerido: lista.length === 1 || !h0 || Math.abs(t.h - h0) <= 0.15 * h0,
        fuera, contorno: null, contornoDe: null, encierra: [],
      });
    });
  }
  const sinUbicar = [...mapa.entries()].filter(([n]) => !porNumero.has(n)).sort((a, b) => a[0] - b[0]).map(([numero, nombre]) => ({ numero, nombre }));
  if (!mapa.size) avisos.push("No encontré la leyenda (renglones «número + nombre»): quedó solo el fondo.");

  // Contornos: el trazado que encierra (o toca) cada número, con el mismo recorte que el fondo.
  const marcasC = componentes.map((c) => {
    const t = textoDe.get(c.clave)!;
    return { clave: c.clave, numero: c.numero, nombre: c.nombre, x: cx(t), y: cy(t), h: t.h, sugerido: c.sugerido };
  });
  const { porClave, utiles } = elegirContornos(entrada.trazados ?? [], recorte, marcasC, segs.map((s) => ({ texto: s.texto, x: centroSeg(s), y: cy(s.items[0]) })));
  for (const c of componentes) {
    const k = porClave.get(c.clave);
    if (k) { c.contorno = k.puntos; c.contornoDe = k.de; c.encierra = k.encierra; }
  }
  if (componentes.length && !utiles) avisos.push("El PDF no trae trazados (rectángulos o polígonos) en el terreno: cada componente entra como un cuadrado.");

  // Máquinas: «D1» suelto en el plano; nombre = rótulo de abajo o la leyenda «D1 Cargador frontal».
  const nombresLeyenda = new Map<string, string>();
  for (const s of segs) for (const m of s.texto.matchAll(RE_MAQ)) nombresLeyenda.set(`D${Number(m[1])}`, m[2].trim());
  const maquinas: MaquinaPdf[] = [];
  for (const s of segs) {
    if (s.items.length !== 1 || !/^D\d{1,2}$/i.test(s.texto) || !dentro(s.items[0])) continue;
    const t = s.items[0];
    const codigo = `D${Number(s.texto.slice(1))}`;
    if (maquinas.some((m) => m.codigo === codigo)) continue;
    const debajo = segs.find((o) => o !== s && o.items[0].y > t.y && o.items[0].y - o.items[0].h <= t.y + 2.2 * t.h
      && Math.abs(centroSeg(o) - cx(t)) <= 3 * t.h && /\p{L}{3}/u.test(o.texto) && !/^D\d/i.test(o.texto));
    const { fx, fy } = frac(t);
    maquinas.push({ codigo, nombre: debajo?.texto ?? nombresLeyenda.get(codigo) ?? null, fx: r4(Math.min(1, Math.max(0, fx))), fy: r4(Math.min(1, Math.max(0, fy))) });
  }

  return {
    escaneado: false, escala, anchoM, altoM, medidasDe, recorte, leyenda: mapa.size,
    componentes, sinUbicar, maquinas: maquinas.sort((a, b) => a.codigo.localeCompare(b.codigo, "es", { numeric: true })), avisos,
    trazados: utiles,
  };
}

// ─── De la propuesta a zonas y máquinas en metros ──────────────────────────

export interface ZonaDesdePdf { codigo: string; nombre: string; tipo: ZonaTipo; poligono: string; notas: string; componente: ComponenteZona }

/** Lado de la marca cuadrada: 4 % del lado corto del terreno, entre 1 y 4 m (2 m en 54 × 48). */
export const ladoMarcaM = (anchoM: number, altoM: number) => Math.min(4, Math.max(1, Math.round(Math.min(anchoM, altoM) * 0.04 * 2) / 2));

/** m² de lo que se crearía para un componente: su contorno o la marca cuadrada. */
export function areaComponenteM2(c: { contorno?: [number, number][] | null }, terreno: { anchoM: number; altoM: number }): number {
  if (c.contorno && c.contorno.length >= 3) return areaContornoM2(c.contorno, terreno);
  return ladoMarcaM(terreno.anchoM, terreno.altoM) ** 2;
}

const coma = (n: number) => String(n).replace(".", ",");

/**
 * Zonas a crear, con el código del tipo + número de la leyenda (PT-08); un
 * número con varios puntos elegidos lleva letra (PP-05a, PP-05b) en el orden
 * recibido. Forma: el contorno del PDF si viene (en metros con las medidas
 * finales), o una marca cuadrada centrada en el número, dentro del terreno.
 * Salen de la más grande a la más chica: el mapa dibuja la lista en ese orden
 * y así la losa queda ENCIMA de la ramada que la encierra (se puede tocar).
 */
export function zonasDesdeComponentes(
  elegidos: (Pick<ComponentePdf, "numero" | "nombre" | "tipo" | "fx" | "fy"> & Partial<Pick<ComponentePdf, "contorno" | "contornoDe" | "categoria">>)[],
  terreno: { anchoM: number; altoM: number },
): ZonaDesdePdf[] {
  const { anchoM, altoM } = terreno;
  const lado = ladoMarcaM(anchoM, altoM);
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const cuantos = new Map<number, number>();
  for (const c of elegidos) cuantos.set(c.numero, (cuantos.get(c.numero) ?? 0) + 1);
  const vistos = new Map<number, number>();
  const zonas = elegidos.map((c) => {
    const k = (vistos.get(c.numero) ?? 0) + 1;
    vistos.set(c.numero, k);
    const letra = (cuantos.get(c.numero) ?? 1) > 1 ? String.fromCharCode(96 + Math.min(k, 26)) : "";
    let poligono: [number, number][];
    let notas: string;
    if (c.contorno && c.contorno.length >= 3) {
      poligono = c.contorno.map(([fx, fy]) => [r2(Math.min(1, Math.max(0, fy)) * altoM), r2(Math.min(1, Math.max(0, fx)) * anchoM)]);
      notas = `Del PDF del croquis: contorno del plano (${coma(r1(areaContornoM2(c.contorno, terreno)))} m²) ${c.contornoDe === "al_lado" ? "pegado al" : "que encierra el"} número ${c.numero}.`;
    } else {
      const x0 = r2(Math.min(Math.max(c.fx * anchoM - lado / 2, 0), anchoM - lado));
      const y0 = r2(Math.min(Math.max(c.fy * altoM - lado / 2, 0), altoM - lado));
      const x1 = r2(x0 + lado), y1 = r2(y0 + lado);
      poligono = [[y0, x0], [y0, x1], [y1, x1], [y1, x0]];
      notas = `Del PDF del croquis: marca de ${coma(lado)} × ${coma(lado)} m en el número ${c.numero}. Dibuja el contorno real si lo necesitas.`;
    }
    return {
      zona: {
        codigo: `${PREFIJO_TIPO[c.tipo]}-${String(c.numero).padStart(2, "0")}${letra}`,
        nombre: c.nombre.slice(0, 120),
        tipo: c.tipo,
        poligono: JSON.stringify(poligono),
        notas,
        componente: { numero: c.numero, nombre: c.nombre.slice(0, 120), categoria: c.categoria ?? categoriaDeNombre(c.nombre) },
      },
      area: areaComponenteM2(c, terreno),
    };
  });
  return zonas.sort((a, b) => b.area - a.area).map((z) => z.zona);
}

/** Las máquinas del PDF sobre las del croquis: mueve las que ya están (y las trae a la planta), agrega las nuevas; el nombre tipeado manda. */
export function aplicarMaquinasPdf(actuales: MaquinaPlanta[], delPdf: MaquinaPdf[], terreno: { anchoM: number; altoM: number }): MaquinaPlanta[] {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const pos = (m: MaquinaPdf) => ({ x: r2(m.fx * terreno.anchoM), y: r2(m.fy * terreno.altoM), fuera: false });
  const porCodigo = new Map(delPdf.map((m) => [m.codigo.toUpperCase(), m]));
  const movidas = actuales.map((a) => {
    const p = porCodigo.get(a.codigo.trim().toUpperCase());
    return p ? { ...a, ...pos(p), nombre: a.nombre.trim() || p.nombre || a.codigo } : a;
  });
  const ya = new Set(actuales.map((a) => a.codigo.trim().toUpperCase()));
  const nuevas = delPdf.filter((m) => !ya.has(m.codigo.toUpperCase())).map((m) => ({ codigo: m.codigo, nombre: m.nombre ?? m.codigo, ...pos(m) }));
  return [...movidas, ...nuevas];
}
