/**
 * gtf-matricial-calibracion — una calibración MEDIDA del talonario de la GTF
 * (el JSON que armó Brandon el 17-10 para el talonario de Aguachini) pasada a
 * la hoja del diseñador «Imprimir en talonario».
 *
 * Las dos convenciones:
 *
 *   · la calibración mide en mm desde la esquina de arriba a la izquierda del
 *     RECUADRO impreso (la raya del borde del formulario) y su `y` es la línea
 *     BASE del texto; las casillas, por su centro; la tabla (34), la base de
 *     cada fila;
 *   · el diseñador (`DisposicionHoja`) mide en mm desde la esquina del PAPEL y
 *     su `y` es el borde de ARRIBA del renglón: la base cae `ptAMm(letra) ×
 *     BASE_EM` más abajo (`renglonesDeCaja`, 2,97 mm a 10 pt).
 *
 * Así que x = recuadro.x + x; y = recuadro.y + base − ptAMm(letra) × BASE_EM,
 * con la letra que ya tenía cada campo. El recuadro no viene en la calibración
 * (la foto está recortada a él): sale de la hoja (`papelYRecuadro`) y se
 * corrige en «Medida › Recuadro» con la regla.
 *
 * Cada clave se empareja por su N° del formulario «(n)» con el rótulo del
 * catálogo: así sirve para el próximo talonario aunque las claves cambien.
 * Lo que la calibración no mide se lleva al recuadro nuevo (`alRecuadro`).
 *
 * PURO: sin DOM y sin "use client".
 */

import { z } from "zod";
import { acotarPos, CATALOGO, mmPorCaracter, type DisposicionHoja } from "./gtf-matricial-disposicion";
import { ptAMm } from "./gtf-matricial-edicion";
import { BASE_EM } from "./gtf-salida-geometria";
import { MARCO_PLANTILLA, PLANTILLA_FABRICA, type MarcoHoja } from "./gtf-talonario-plantilla";

// ── El archivo ──────────────────────────────────────────────────────────────

const num = z.number();
const texto = (max: number) => z.string().max(max);
const campoSchema = z.object({ clave: texto(60).min(1), campo: texto(160), x: num, y: num, ancho: num.positive() });
const casillaSchema = z.object({ clave: texto(60).min(1), casilla: texto(160), x_centro: num, y_centro: num });
const columnaSchema = z.object({ clave: texto(20).min(1), contenido: texto(80).optional(), x: num, ancho: num.positive() });

export const calibracionSchema = z.object({
  formato: texto(200).optional(),
  unidad: z.literal("mm").optional(),
  marco_medido_mm: z.object({ ancho: num.min(20).max(1000), alto: num.min(20).max(1000) }),
  /** «linea base del texto» (lo de Aguachini) o «borde superior». */
  y_es: texto(80).optional(),
  campos: z.array(campoSchema).max(200),
  casillas: z.array(casillaSchema).max(100).optional(),
  tabla_34: z
    .object({ filas: z.int().min(1).max(200), y_lineas: z.array(num).min(1).max(200), columnas: z.array(columnaSchema).max(20) })
    .optional(),
});

export type CalibracionGtf = z.infer<typeof calibracionSchema>;

// ── El papel ────────────────────────────────────────────────────────────────

/** Las hojas de siempre (mm). Oficio = 8,5 × 13 pulgadas, el «oficio» de las imprentas del Perú. */
export const MEDIDAS_PAPEL: ReadonlyArray<{ nombre: string; ancho: number; alto: number }> = [
  { nombre: "A4", ancho: 210, alto: 297 },
  { nombre: "Carta", ancho: 215.9, alto: 279.4 },
  { nombre: "Oficio", ancho: 216, alto: 330 },
  { nombre: "A5", ancho: 148, alto: 210 },
];

const r2 = (v: number): number => Math.round(v * 100) / 100;

export interface PapelYRecuadro {
  anchoMm: number;
  altoMm: number;
  /** Del borde izquierdo y del de arriba del papel a la raya del recuadro. */
  x: number;
  y: number;
  /** La medida de `MEDIDAS_PAPEL` elegida; null = se quedó la de la hoja. */
  papel: string | null;
}

/**
 * Dónde cae un recuadro de `ancho × alto` si nadie midió el papel: el mismo
 * lugar si la hoja ya tenía un recuadro de esa medida (volver a cargar no pisa
 * lo medido con regla); si entra en la hoja, centrado en ella; si no, centrado
 * en la hoja de siempre más chica donde entra (195 × 299,5 → Oficio, 10,5 y 15,25).
 */
export function papelYRecuadro(medida: { ancho: number; alto: number }, hoja: Pick<DisposicionHoja, "anchoMm" | "altoMm" | "marco">): PapelYRecuadro {
  const m = hoja.marco;
  if (m && Math.abs(m.ancho - medida.ancho) < 0.05 && Math.abs(m.alto - medida.alto) < 0.05) {
    return { anchoMm: hoja.anchoMm, altoMm: hoja.altoMm, x: m.x, y: m.y, papel: null };
  }
  const centrado = (anchoMm: number, altoMm: number, papel: string | null): PapelYRecuadro => ({
    anchoMm, altoMm, x: r2((anchoMm - medida.ancho) / 2), y: r2((altoMm - medida.alto) / 2), papel,
  });
  if (medida.ancho <= hoja.anchoMm && medida.alto <= hoja.altoMm) return centrado(hoja.anchoMm, hoja.altoMm, null);
  const entra = MEDIDAS_PAPEL.filter((p) => medida.ancho <= p.ancho && medida.alto <= p.alto).sort((a, b) => a.ancho * a.alto - b.ancho * b.alto)[0];
  return entra ? centrado(entra.ancho, entra.alto, entra.nombre) : centrado(r2(medida.ancho + 10), r2(medida.alto + 10), null);
}

// ── Mover todo con el recuadro ──────────────────────────────────────────────

const baseMm = (letraPt: number): number => ptAMm(letraPt) * BASE_EM;

/**
 * La hoja con su recuadro en `nuevo`: cada valor se lleva con él, estirado a
 * su medida (la base del texto cae en el mismo lugar del formulario; anchos y
 * alto de fila, a escala). Sin recuadro, la hoja está sobre el de la plantilla.
 * Mover el recuadro sin cambiar su medida corre todo junto.
 */
export function alRecuadro(hoja: DisposicionHoja, nuevo: MarcoHoja): DisposicionHoja {
  const o = hoja.marco ?? MARCO_PLANTILLA;
  const sx = nuevo.ancho / o.ancho;
  const sy = nuevo.alto / o.alto;
  const X = (x: number) => r2(acotarPos(nuevo.x + (x - o.x) * sx));
  /* Se lleva la BASE (lo que se ve en el papel) y se vuelve al borde de arriba con la misma letra. */
  const Y = (y: number, letraPt: number) => r2(acotarPos(nuevo.y + (y + baseMm(letraPt) - o.y) * sy - baseMm(letraPt)));
  const A = (a: number) => Math.max(1, r2(a * sx));
  return {
    ...hoja,
    marco: { ...nuevo },
    campos: Object.fromEntries(Object.entries(hoja.campos).map(([id, c]) => [id, { ...c, x: X(c.x), y: Y(c.y, c.letraPt), anchoMm: A(c.anchoMm) }])),
    tabla: {
      ...hoja.tabla,
      y: Y(hoja.tabla.y, hoja.tabla.letraPt),
      altoFilaMm: Math.min(60, Math.max(2, r2(hoja.tabla.altoFilaMm * sy))),
      columnas: Object.fromEntries(Object.entries(hoja.tabla.columnas).map(([id, c]) => [id, { ...c, x: X(c.x), anchoMm: A(c.anchoMm) }])),
    },
  };
}

/** «Recuadro · izquierda / arriba»: corre el recuadro y todo lo de la hoja con él (la medida queda). */
export const moverRecuadro = (hoja: DisposicionHoja, x: number, y: number): DisposicionHoja =>
  alRecuadro(hoja, { ...(hoja.marco ?? MARCO_PLANTILLA), x, y });

// ── Emparejar por el N° del formulario ──────────────────────────────────────

/** El N° del formulario al principio de un rótulo: «(34h) Total…» → «34h». */
const numeroDe = (rotulo: string): string | null => /^\s*\((\d{1,2}[a-h]?)\)/i.exec(rotulo)?.[1]?.toLowerCase() ?? null;

/** Sin el «(n)», sin tildes ni signos: «Cambio de Uso» = «cambio de uso». */
const plano = (rotulo: string): string =>
  rotulo
    .replace(/^\s*\(\d{1,2}[a-h]?\)/i, "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const anexoDe = (rotulo: string): string | null => /anexo\s*0?(\d)/i.exec(plano(rotulo))?.[1] ?? null;

interface Candidato {
  id: string;
  label: string;
}

/** Los campos que se imprimen de la guía, por su N° del formulario. */
function porNumero(): Map<string, Candidato[]> {
  const m = new Map<string, Candidato[]>();
  for (const c of CATALOGO.guia.campos) {
    const n = !c.oculto ? numeroDe(c.label) : null;
    if (n) m.set(n, [...(m.get(n) ?? []), { id: c.id, label: c.label }]);
  }
  return m;
}

/** De varios campos con el mismo N° (las casillas del (5) y del (36)), el que se llama igual. */
function elDeNombre(rotulo: string, candidatos: Candidato[]): Candidato | null {
  const a = anexoDe(rotulo);
  if (a) return candidatos.find((c) => anexoDe(c.label) === a) ?? null;
  const p = plano(rotulo);
  return candidatos.find((c) => {
    const q = plano(c.label);
    return q === p || q.startsWith(p) || p.startsWith(q);
  }) ?? null;
}

/** «DNI/RUC»: dos campos en el mismo renglón del papel, el RUC primero (como la plantilla). */
const parDocumento = (cs: Candidato[]): [Candidato, Candidato] | null => {
  const ruc = cs.find((c) => /el ruc$/i.test(plano(c.label)));
  const dni = cs.find((c) => /el dni$/i.test(plano(c.label)));
  return cs.length === 2 && ruc && dni ? [ruc, dni] : null;
};

export interface Emparejado {
  clave: string;
  /** El rótulo de la calibración. */
  campo: string;
  /** Los ids del catálogo que toma (dos en «DNI/RUC»). */
  ids: string[];
  tipo: "campo" | "casilla" | "columna" | "tabla";
}

export interface SinPar {
  clave: string;
  campo: string;
  motivo: string;
}

function motivoSinPar(rotulo: string, usadoPor: string | null): string {
  const n = numeroDe(rotulo);
  if (usadoPor) return `El sistema imprime ese N° en un solo renglón: va en «${usadoPor}»`;
  if (/registro/i.test(rotulo) && !n) return "El N° de registro lo asigna SERFOR al registrar la guía: el sistema no lo llena";
  if (n === "37" || n === "38" || n === "39") return "Lo escribe a mano quien emite: el sistema no lo llena";
  if (anexoDe(rotulo)) return "Esa casilla la marca a mano quien emite";
  return "El sistema no tiene un campo con ese N° del formulario";
}

/** Qué id del catálogo toma cada clave de la calibración, y cuáles quedan sin par (con el porqué). */
export function emparejarCalibracion(cal: CalibracionGtf): { pares: Emparejado[]; sinPar: SinPar[] } {
  const indice = porNumero();
  const usados = new Map<string, string>();
  const pares: Emparejado[] = [];
  const sinPar: SinPar[] = [];
  const tomar = (clave: string, rotulo: string, tipo: Emparejado["tipo"]) => {
    const cs = indice.get(numeroDe(rotulo) ?? "") ?? [];
    const doc = parDocumento(cs);
    const elegidos = doc ? [...doc] : cs.length === 1 ? cs : [elDeNombre(rotulo, cs)].filter((c): c is Candidato => !!c);
    const ocupado = elegidos.find((c) => usados.has(c.id));
    if (elegidos.length === 0 || ocupado) {
      sinPar.push({ clave, campo: rotulo, motivo: motivoSinPar(rotulo, ocupado ? usados.get(ocupado.id) ?? null : null) });
      return;
    }
    for (const c of elegidos) usados.set(c.id, rotulo);
    pares.push({ clave, campo: rotulo, ids: elegidos.map((c) => c.id), tipo });
  };
  for (const c of cal.campos) tomar(c.clave, c.campo, "campo");
  for (const c of cal.casillas ?? []) tomar(c.clave, c.casilla, "casilla");
  const columnas = CATALOGO.guia.columnas;
  for (const c of cal.tabla_34?.columnas ?? []) {
    const col = columnas.find((d) => numeroDe(d.label) === c.clave.toLowerCase());
    if (col) pares.push({ clave: c.clave, campo: `(${c.clave}) ${c.contenido ?? col.label}`, ids: [col.id], tipo: "columna" });
    else sinPar.push({ clave: c.clave, campo: `(${c.clave}) ${c.contenido ?? ""}`.trim(), motivo: "El cuadro (34) del sistema no tiene esa columna" });
  }
  if (cal.tabla_34) pares.push({ clave: "tabla_34", campo: "(34) Filas del cuadro", ids: ["tabla"], tipo: "tabla" });
  return { pares, sinPar };
}

// ── Aplicar ─────────────────────────────────────────────────────────────────

/** Mitad de la mayúscula de Courier New (1170/2048 em): la «X» queda centrada en la casilla. */
const MITAD_MAYUSCULA_EM = 1170 / 2048 / 2;
/** El RUC tiene 11 cifras: con medio carácter de aire, el DNI va en el resto del renglón. */
const CIFRAS_RUC = 11.5;

export interface ResultadoCalibracion {
  hoja: DisposicionHoja;
  pares: Emparejado[];
  sinPar: SinPar[];
  recuadro: PapelYRecuadro;
}

/**
 * La hoja de la guía con la calibración puesta: primero todo se lleva al
 * recuadro nuevo (lo que la calibración no mide queda en su lugar del
 * formulario), después cada valor medido va a su medida. La letra, la
 * alineación y si se imprime son los de la hoja: la calibración sólo pone
 * dónde. `recuadro` = dónde cae en el papel (por defecto `papelYRecuadro`).
 */
export function aplicarCalibracion(hoja: DisposicionHoja, cal: CalibracionGtf, recuadro?: Partial<PapelYRecuadro>): ResultadoCalibracion {
  const medida = cal.marco_medido_mm;
  const pr: PapelYRecuadro = { ...papelYRecuadro(medida, hoja), ...recuadro };
  const m: MarcoHoja = { x: pr.x, y: pr.y, ancho: medida.ancho, alto: medida.alto };
  const yEsBase = !/superior|arriba|top/i.test(cal.y_es ?? "base");
  const h = alRecuadro({ ...hoja, plantilla: PLANTILLA_FABRICA, anchoMm: pr.anchoMm, altoMm: pr.altoMm }, m);
  const { pares, sinPar } = emparejarCalibracion(cal);
  const X = (x: number) => r2(acotarPos(m.x + x));
  const Y = (y: number, letraPt: number) => r2(acotarPos(m.y + y - (yEsBase ? baseMm(letraPt) : 0)));

  const campos = { ...h.campos };
  const columnas = { ...h.tabla.columnas };
  let tabla = { ...h.tabla };
  for (const p of pares) {
    if (p.tipo === "campo") {
      const c = cal.campos.find((k) => k.clave === p.clave);
      if (!c) continue;
      const [a, b] = p.ids;
      const ca = campos[a];
      const pos = { ...ca, x: X(c.x), y: Y(c.y, ca.letraPt), anchoMm: Math.max(1, r2(c.ancho)) };
      if (!b) {
        campos[a] = pos;
        continue;
      }
      /* DNI/RUC: el RUC al principio del renglón, el DNI en lo que queda. */
      const ancho = Math.min(pos.anchoMm, r2(CIFRAS_RUC * mmPorCaracter(ca.letraPt)));
      campos[a] = { ...pos, anchoMm: ancho };
      const cb = campos[b];
      campos[b] = { ...cb, x: r2(pos.x + ancho), y: Y(c.y, cb.letraPt), anchoMm: Math.max(1, r2(pos.anchoMm - ancho)) };
    } else if (p.tipo === "casilla") {
      const c = (cal.casillas ?? []).find((k) => k.clave === p.clave);
      const ca = c && campos[p.ids[0]];
      if (!c || !ca) continue;
      const centro = yEsBase ? baseMm(ca.letraPt) - ptAMm(ca.letraPt) * MITAD_MAYUSCULA_EM : 0;
      campos[p.ids[0]] = { ...ca, x: X(c.x_centro - ca.anchoMm / 2), y: r2(acotarPos(m.y + c.y_centro - centro)), alinea: "centro" };
    } else if (p.tipo === "columna") {
      const c = (cal.tabla_34?.columnas ?? []).find((k) => k.clave === p.clave);
      if (c) columnas[p.ids[0]] = { ...columnas[p.ids[0]], x: X(c.x), anchoMm: Math.max(1, r2(c.ancho)) };
    } else if (cal.tabla_34) {
      const ys = cal.tabla_34.y_lineas;
      const paso = ys.length > 1 ? (ys[ys.length - 1] - ys[0]) / (ys.length - 1) : tabla.altoFilaMm;
      tabla = { ...tabla, y: Y(ys[0], tabla.letraPt), altoFilaMm: Math.min(60, Math.max(2, r2(paso))), maxFilas: cal.tabla_34.filas };
    }
  }
  return { hoja: { ...h, campos, tabla: { ...tabla, columnas } }, pares, sinPar, recuadro: pr };
}
