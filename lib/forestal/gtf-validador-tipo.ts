/**
 * gtf-validador-tipo — «¿este tipo de producto está bien puesto?» (Brandon
 * 2026-10-03, fase 3 de alinear el sistema con la GTF).
 *
 * El caso que lo pidió: en la GTF real, Copal quedó como MADERA ASERRADA
 * (COMERCIAL) con 18 piezas y 0,096 m³ = 0,0053 m³ por pieza, que es lo que
 * pesa una TABLA (todas las TABLA de esa guía van de 0,0052 a 0,0054). El
 * volumen no cambia, pero el papel declara otro producto.
 *
 * Regla (decisión 3): una fila se marca cuando su m³ por pieza cae FUERA de la
 * banda de su tipo y DENTRO de la de otro. Un rango fijo (0,07–0,11 para
 * COMERCIAL) daba 3 falsos avisos en esa misma guía —Cachimbo 0,054, Shimbillo
 * 0,049, Panguana 0,112—: piezas comerciales de verdad, sólo más chicas o más
 * grandes. La banda de cada tipo es su mediana ÷ 3 a × 3: la mediana sale de
 * la propia guía cuando trae 3 filas o más de ese tipo (una fila mal puesta no
 * mueve la mediana) y si no, del histórico de abajo. Las dos cosas se pueden
 * cambiar por parámetro.
 *
 * Sólo mira los 4 tipos de la GTF; el resto (rolliza, paquetería, bloques…)
 * no tiene banda y no se marca. PURO y client-safe.
 */

import { tipoComercialDelProducto } from "./loctp-catalogos";

export const TIPOS_GTF = ["COMERCIAL", "LARGA ANGOSTA", "CORTA", "TABLA"] as const;
export type TipoGTF = (typeof TIPOS_GTF)[number];

/**
 * Mediana de m³ por pieza de cada tipo en la GTF real del 2026-10-03 (Blas,
 * 38 filas sin la de Copal): COMERCIAL 0,0863 · LARGA ANGOSTA 0,00825 ·
 * CORTA 0,0037 · TABLA 0,00531.
 */
export const MEDIANAS_HISTORICAS: Readonly<Record<TipoGTF, number>> = {
  COMERCIAL: 0.0863,
  "LARGA ANGOSTA": 0.00825,
  CORTA: 0.0037,
  TABLA: 0.00531,
};

/** Cuántas veces por encima o por debajo de la mediana sigue siendo «su» tipo. */
export const FACTOR_BANDA = 3;

/** Con menos filas de un tipo en la guía, manda el histórico. */
const MIN_FILAS_PROPIAS = 3;

export const MENSAJE_TIPO_DUDOSO = "⚠️ Posible tipo de producto mal asignado: revisar antes de emitir/aceptar la GTF";

export interface FilaParaRevisar {
  comun?: string | null;
  cientifico?: string | null;
  /** El texto del casillero: «MADERA ASERRADA (COMERCIAL)». */
  tipoProducto?: string | null;
  cantidad?: number | null;
  /** m³ de la fila. */
  total?: number | null;
  /** «Metros Cúbicos» / «m3». Una fila en pie tablar o en piezas no se revisa: su total no es m³. */
  unidad?: string | null;
}

export interface Banda {
  min: number;
  max: number;
  mediana: number;
  /** De dónde salió la mediana: de la propia guía o del histórico. */
  origen: "guia" | "historico";
}

export interface AvisoTipo {
  indice: number;
  especie: string;
  tipo: TipoGTF;
  piezas: number;
  m3: number;
  m3PorPieza: number;
  banda: Banda;
  /** El tipo cuya banda lo contiene y cuya mediana queda más cerca. */
  tipoProbable: TipoGTF;
  bandaProbable: Banda;
  mensaje: string;
  /** «Copal · COMERCIAL: 18 piezas en 0,096 m³ = 0,0053 m³ por pieza…» */
  detalle: string;
}

export interface OpcionesRevision {
  medianas?: Partial<Record<TipoGTF, number>>;
  factor?: number;
}

/** Sin unidad se asume m³ (el casillero de la GTF de aserrada es siempre «Metros Cúbicos»). */
const enM3 = (u: string | null | undefined) => !u?.trim() || /m3|m³|metros?\s+c[uú]bicos?/i.test(u);

const norm = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** El tipo de la GTF de un casillero o de un tipo del cubicador; `null` si no es uno de los 4. */
export function tipoGTF(texto: string | null | undefined): TipoGTF | null {
  const t = norm(tipoComercialDelProducto(texto) ?? texto ?? "");
  const porNombre: Record<string, TipoGTF> = {
    comercial: "COMERCIAL",
    "larga angosta": "LARGA ANGOSTA",
    corta: "CORTA",
    tabla: "TABLA",
  };
  return porNombre[t] ?? null;
}

function mediana(vs: readonly number[]): number {
  const s = [...vs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** La banda de cada tipo para ESTA guía. */
export function bandasDeLaGuia(filas: readonly FilaParaRevisar[], opts: OpcionesRevision = {}): Record<TipoGTF, Banda> {
  const factor = opts.factor ?? FACTOR_BANDA;
  const porTipo = new Map<TipoGTF, number[]>();
  for (const f of filas) {
    const tipo = tipoGTF(f.tipoProducto);
    const piezas = Number(f.cantidad) || 0;
    const m3 = Number(f.total) || 0;
    if (!tipo || piezas <= 0 || m3 <= 0 || !enM3(f.unidad)) continue;
    porTipo.set(tipo, [...(porTipo.get(tipo) ?? []), m3 / piezas]);
  }
  const out = {} as Record<TipoGTF, Banda>;
  for (const tipo of TIPOS_GTF) {
    const propias = porTipo.get(tipo) ?? [];
    const deLaGuia = propias.length >= MIN_FILAS_PROPIAS;
    const med = deLaGuia ? mediana(propias) : (opts.medianas?.[tipo] ?? MEDIANAS_HISTORICAS[tipo]);
    out[tipo] = { min: med / factor, max: med * factor, mediana: med, origen: deLaGuia ? "guia" : "historico" };
  }
  return out;
}

const dentro = (v: number, b: Banda) => v >= b.min && v <= b.max;
const n = (v: number, dec: number) => v.toLocaleString("es-PE", { minimumFractionDigits: dec, maximumFractionDigits: dec });
/** m³ por pieza con 2 cifras significativas, que es lo que distingue un tipo de otro. */
const porPieza = (v: number) => n(v, Math.max(3, Math.min(5, 1 - Math.floor(Math.log10(v)))));

/** Las filas cuyo m³ por pieza dice otro tipo de producto. */
export function revisarTiposGTF(filas: readonly FilaParaRevisar[], opts: OpcionesRevision = {}): AvisoTipo[] {
  const bandas = bandasDeLaGuia(filas, opts);
  const avisos: AvisoTipo[] = [];
  filas.forEach((f, indice) => {
    const tipo = tipoGTF(f.tipoProducto);
    const piezas = Number(f.cantidad) || 0;
    const m3 = Number(f.total) || 0;
    if (!tipo || piezas <= 0 || m3 <= 0 || !enM3(f.unidad)) return;
    const v = m3 / piezas;
    if (dentro(v, bandas[tipo])) return;
    const candidatos = TIPOS_GTF.filter((t) => t !== tipo && dentro(v, bandas[t]));
    if (candidatos.length === 0) return;
    // El más cercano en proporción (0,0053 está a ×1,0 de TABLA y a ×1,4 de CORTA).
    const lejania = (t: TipoGTF) => Math.abs(Math.log(v / bandas[t].mediana));
    const tipoProbable = candidatos.reduce((a, b) => (lejania(b) < lejania(a) ? b : a));
    const especie = f.comun?.trim() || f.cientifico?.trim() || "Sin especie";
    const b = bandas[tipo];
    avisos.push({
      indice, especie, tipo, piezas, m3, m3PorPieza: v, banda: b,
      tipoProbable, bandaProbable: bandas[tipoProbable],
      mensaje: MENSAJE_TIPO_DUDOSO,
      detalle:
        `${especie} · ${tipo}: ${piezas} piezas en ${n(m3, 3)} m³ = ${porPieza(v)} m³ por pieza. ` +
        `${b.origen === "guia" ? "Las" : "Una"} ${tipo} ${b.origen === "guia" ? "de esta guía rondan" : "suele rondar"} ${porPieza(b.mediana)}; ` +
        `${porPieza(v)} es lo de una ${tipoProbable}.`,
    });
  });
  return avisos;
}
