/**
 * despacho-viaje — qué líneas de despacho son el MISMO viaje y cómo se reparte
 * el precio de ese viaje entre ellas.
 *
 * Un camión sale con varias GTF (una por permiso de origen) y SUNAT ampara el
 * viaje entero con UNA guía de remisión (GRE): en Blas, el 28-10-2026, la
 * EG07-189 cubrió las GTF 69, 70 y 71 (7 líneas, 864 piezas, 7 013,33 PT). Y el
 * comprador paga el viaje, no la línea: el precio se escribe una vez y se
 * reparte por volumen.
 *
 * Sin servidor ni base: lo usan la DB class (que decide y escribe) y la
 * pantalla (que sólo previsualiza; el total lo vuelve a calcular el backend).
 */
import { leerPlaca } from "./placa-peru";
import { PT_POR_M3 } from "./cubicacion";

// ─── Mismo viaje ─────────────────────────────────────────────────────────────

/** Lo que hace falta de una línea de despacho para saber de qué viaje es. */
export interface LineaDeViaje {
  entryDate: Date | string;
  destino: string | null;
  /** JSON crudo de la GTF (puede ser null: en Blas las 7 del 28-10 lo tienen null). */
  gtfDatos: unknown;
}

function objeto(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
const textoDe = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** El día del despacho (date-only, en UTC: `entryDate` se guarda a medianoche UTC). */
export function diaDeDespacho(d: Date | string): string {
  const f = d instanceof Date ? d : new Date(d);
  return Number.isNaN(f.getTime()) ? "" : f.toISOString().slice(0, 10);
}

/** «2026-10-28» → «28-10». */
export function diaCorto(dia: string): string {
  const [, m, d] = dia.split("-");
  return d && m ? `${d}-${m}` : dia;
}

/** La placa del camión anotada en la GTF, normalizada para comparar; null si no hay. */
export function placaDeDespacho(gtfDatos: unknown): string | null {
  const l = leerPlaca(textoDe(objeto(objeto(gtfDatos).vehiculo).placa));
  return l.estado === "vacia" ? null : l.normalizada;
}

const RUC_EN_TEXTO = /\b(?:10|15|17|20)\d{9}\b/;
const normalizarNombre = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^0-9a-z]+/g, " ")
    .trim();

/**
 * A quién va la carga: el documento (RUC/DNI) si se sabe, y el nombre. De la
 * GTF si está llena; si no, del `destino` del libro, que en Blas se escribe
 * «PAC & JAL S.A.C. (RUC 20609484391) · Av. …».
 */
export function destinatarioDeDespacho(l: Pick<LineaDeViaje, "destino" | "gtfDatos">): { doc: string | null; nombre: string | null } {
  const d = objeto(objeto(l.gtfDatos).destinatario);
  const docGtf = textoDe(d.docNumero).replace(/\D/g, "");
  const destino = textoDe(l.destino);
  const doc = docGtf.length === 8 || docGtf.length === 11 ? docGtf : (RUC_EN_TEXTO.exec(destino)?.[0] ?? null);
  // El nombre es lo de antes del paréntesis o del «·» (la dirección viene después).
  const crudo = textoDe(d.nombre) || destino.split("·")[0].split("(")[0];
  const nombre = normalizarNombre(crudo);
  return { doc, nombre: nombre || null };
}

export type MismoViaje = { mismo: true } | { mismo: false; motivo: string };

/**
 * ¿Las dos líneas salieron en el mismo camión? Mismo día y, además, la misma
 * placa o el mismo destinatario (una GRE lleva un solo punto de llegada). Una
 * placa o un destinatario DISTINTO lo descarta aunque lo otro coincida. Sin
 * placa ni destinatario en ninguna de las dos no hay cómo saberlo: no es el
 * mismo (ante la duda, la GRE repetida sigue siendo un tipeo).
 */
export function mismoViaje(a: LineaDeViaje, b: LineaDeViaje): MismoViaje {
  const diaA = diaDeDespacho(a.entryDate);
  const diaB = diaDeDespacho(b.entryDate);
  if (!diaA || diaA !== diaB) return { mismo: false, motivo: `salió otro día (${diaCorto(diaB)})` };

  const placaA = placaDeDespacho(a.gtfDatos);
  const placaB = placaDeDespacho(b.gtfDatos);
  if (placaA && placaB && placaA !== placaB) return { mismo: false, motivo: `otro camión (placa ${placaB})` };

  const destA = destinatarioDeDespacho(a);
  const destB = destinatarioDeDespacho(b);
  const docIgual = destA.doc && destB.doc ? destA.doc === destB.doc : null;
  const nombreIgual = destA.nombre && destB.nombre ? destA.nombre === destB.nombre : null;
  // El documento manda sobre el nombre («PAC & JAL» y «Pac y Jal SAC» con el mismo RUC son uno).
  const destIgual = docIgual ?? nombreIgual;
  if (destIgual === false) return { mismo: false, motivo: "va a otro destinatario" };

  if ((placaA && placaA === placaB) || destIgual === true) return { mismo: true };
  return { mismo: false, motivo: "no tiene placa ni destinatario para saber si es el mismo camión" };
}

// ─── Volumen de una línea ────────────────────────────────────────────────────

/** Lo que hace falta de una línea para repartirle el precio. */
export interface LineaConVolumen {
  id: string;
  lineNo: number;
  quantity: number | null;
  unit: string | null;
  observations: string | null;
}

/** «1170.167 PT · Anexo…» o «1,170.17 PT»: el PT escrito al COMIENZO de la observación. */
const PT_EN_NOTA = /^\s*(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*PT\b/i;

/**
 * El PT de la línea: la cantidad si se declaró en PT; si no, el que quedó
 * escrito al comienzo de la observación (así lo cargó Blas el 28-10: el libro
 * declara m³ y el PT medido va en la nota). `null` si no hay ninguno: el PT
 * que se saca del m³ (×424) es un derivado y no se presenta como medido.
 */
export function ptDeDespacho(l: Pick<LineaConVolumen, "quantity" | "unit" | "observations">): { pt: number; fuente: "cantidad" | "nota" } | null {
  if ((l.unit ?? "").toLowerCase() === "pt" && l.quantity != null && l.quantity > 0) return { pt: l.quantity, fuente: "cantidad" };
  const m = PT_EN_NOTA.exec(l.observations ?? "");
  if (!m) return null;
  const pt = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(pt) && pt > 0 ? { pt, fuente: "nota" } : null;
}

/** El m³ de la línea (sólo si se declaró en m³). */
export function m3DeDespacho(l: Pick<LineaConVolumen, "quantity" | "unit">): number | null {
  const u = (l.unit ?? "m3").toLowerCase();
  return u === "m3" && l.quantity != null && l.quantity > 0 ? l.quantity : null;
}

// ─── Reparto del precio ──────────────────────────────────────────────────────

export interface RepartoLinea {
  id: string;
  lineNo: number;
  /** El volumen con el que se repartió, en la unidad de `base`; null = sin volumen. */
  volumen: number | null;
  /** Soles de esta línea. null = no recibe (sin volumen): NUNCA 0. */
  monto: number | null;
}

export type RepartoViaje =
  | {
      ok: true;
      /** «pt»: todas las líneas con PT medido; «m3»: alguna sin PT, se repartió por m³. */
      base: "pt" | "m3";
      total: number;
      /** PT del viaje. Con `ptEstimado`, sale del m³ ×424 donde falta el medido. */
      ptTotal: number;
      ptEstimado: boolean;
      m3Total: number | null;
      /** S/ por PT (4 decimales): el precio que de verdad se le puso a la madera. */
      precioPorPt: number;
      lineas: RepartoLinea[];
      /** Las líneas que no recibieron precio por no tener volumen. */
      sinVolumen: number[];
    }
  | { ok: false; motivo: "sin_lineas" | "total_invalido" | "sin_volumen" };

const ESCALA_VOLUMEN = 10_000; // 4 decimales: los del libro (Decimal 14,4)
const aCentimos = (n: number) => Math.round(Number((n * 100).toFixed(6)));
const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

/**
 * Reparte `total` soles entre las líneas del viaje en proporción a su volumen:
 * por PT si TODAS las que tienen volumen tienen su PT; si no, por m³ (las dos
 * unidades no se mezclan en un mismo reparto). Cada línea redondea a céntimos y
 * la ÚLTIMA (por N.º de línea) se lleva el residuo, así la suma es el total
 * exacto. La línea sin volumen no recibe: `monto: null`, nunca 0.
 */
export function repartirPrecioViaje(total: number, lineas: readonly LineaConVolumen[]): RepartoViaje {
  if (lineas.length === 0) return { ok: false, motivo: "sin_lineas" };
  if (!Number.isFinite(total) || !(total > 0)) return { ok: false, motivo: "total_invalido" };

  const orden = [...lineas].sort((a, b) => a.lineNo - b.lineNo);
  const vol = orden.map((l) => ({ l, pt: ptDeDespacho(l)?.pt ?? null, m3: m3DeDespacho(l) }));
  const conVolumen = vol.filter((v) => v.pt != null || v.m3 != null);
  if (conVolumen.length === 0) return { ok: false, motivo: "sin_volumen" };

  const base: "pt" | "m3" = conVolumen.every((v) => v.pt != null) ? "pt" : conVolumen.every((v) => v.m3 != null) ? "m3" : "pt";
  // Mezcla (unas sólo con PT, otras sólo con m³): todo a PT, con el m³ ×424 donde falta.
  const pesoDe = (v: (typeof vol)[number]): number | null =>
    base === "m3" ? v.m3 : v.pt ?? (v.m3 != null ? v.m3 * PT_POR_M3 : null);
  const pesos = vol.map((v) => {
    const p = pesoDe(v);
    const entero = p != null ? Math.round(p * ESCALA_VOLUMEN) : 0;
    return entero > 0 ? { volumen: p as number, entero: BigInt(entero) } : null;
  });
  const reciben = pesos.flatMap((p, i) => (p ? [i] : []));
  if (reciben.length === 0) return { ok: false, motivo: "sin_volumen" };

  // `BigInt(…)` y no literales `0n`: el tsconfig del repo apunta a < ES2020.
  const CERO = BigInt(0);
  const DOS = BigInt(2);
  const totalC = BigInt(aCentimos(total));
  const suma = reciben.reduce((t, i) => t + (pesos[i] as { entero: bigint }).entero, CERO);
  const ultima = reciben[reciben.length - 1];
  const partir = (redondear: boolean) => {
    const out = new Map<number, bigint>();
    let puesto = CERO;
    for (const i of reciben) {
      if (i === ultima) continue;
      const w = (pesos[i] as { entero: bigint }).entero;
      // Mitad hacia arriba en enteros: (2·T·w + S) ÷ 2S. Sin redondear = piso.
      const c = redondear ? (DOS * totalC * w + suma) / (DOS * suma) : (totalC * w) / suma;
      out.set(i, c);
      puesto += c;
    }
    out.set(ultima, totalC - puesto);
    return out;
  };
  let centimos = partir(true);
  // Con muchas líneas y una última diminuta, el redondeo de las otras podría
  // dejarla negativa: con piso el residuo siempre es ≥ 0.
  if ((centimos.get(ultima) as bigint) < CERO) centimos = partir(false);

  const ptTotal = vol.reduce((t, v) => t + (v.pt ?? (v.m3 != null ? v.m3 * PT_POR_M3 : 0)), 0);
  const m3s = vol.filter((v) => v.m3 != null);
  return {
    ok: true,
    base,
    total: Number(totalC) / 100,
    ptTotal: Math.round(ptTotal * 1000) / 1000,
    ptEstimado: conVolumen.some((v) => v.pt == null),
    m3Total: m3s.length ? r4(m3s.reduce((t, v) => t + (v.m3 as number), 0)) : null,
    precioPorPt: ptTotal > 0 ? r4(Number(totalC) / 100 / ptTotal) : 0,
    lineas: vol.map((v, i) => ({
      id: v.l.id,
      lineNo: v.l.lineNo,
      volumen: pesos[i] ? r4((pesos[i] as { volumen: number }).volumen) : null,
      monto: centimos.has(i) ? Number(centimos.get(i)) / 100 : null,
    })),
    sinVolumen: vol.flatMap((v, i) => (pesos[i] ? [] : [v.l.lineNo])),
  };
}

// ─── Lo que viaja entre el servidor y la pantalla ────────────────────────────

/** Una línea del viaje tal como la ve la pantalla (números ya en `number`, null = sin dato). */
export interface LineaDelViaje {
  id: string;
  lineNo: number;
  gtfNumber: string | null;
  productType: string | null;
  speciesCommon: string | null;
  pieces: number | null;
  quantity: number | null;
  unit: string | null;
  observations: string | null;
  m3: number | null;
  pt: number | null;
  ptFuente: "cantidad" | "nota" | null;
  valorVenta: number | null;
  moneda: string;
  /** GRE anotada en su guía ("" = ninguna). */
  gre: string;
  /** N.º de factura/boleta anotado en su guía ("" = ninguno). */
  comprobante: string;
}
export interface ViajeDeDespacho {
  /** Día de salida (AAAA-MM-DD, UTC: es date-only). */
  dia: string;
  /** Las GTF del viaje, sin repetir, en orden de línea. */
  guias: string[];
  lineas: LineaDelViaje[];
}
/** Cómo quedó cada línea del viaje al anotar la GRE en todas. */
export type GreEnLinea = { id: string; lineNo: number; gtfNumber: string | null } & (
  | { estado: "anotada" | "ya_estaba" }
  | { estado: "tenia_otra"; actual: string }
  | { estado: "no_se_pudo"; motivo: string }
);

/** «19-001-0000069» → «69»: como lo nombra el dueño. */
export function gtfCorta(gtf: string): string {
  const ultimo = gtf.trim().split("-").pop() ?? "";
  return ultimo.replace(/^0+(?=\d)/, "") || gtf.trim();
}

/**
 * Factura contra liquidación: lo que falta facturar (positivo) o lo que la
 * factura pasa a la liquidación (negativo). Medio céntimo de tolerancia: es
 * la unidad del dinero, no el epsilon del float.
 */
export function diferenciaConLiquidacion(total: number, liquidacion: number): { diferencia: number; estado: "cuadra" | "falta" | "sobra" } {
  const d = (aCentimos(liquidacion) - aCentimos(total)) / 100;
  return { diferencia: d, estado: d === 0 ? "cuadra" : d > 0 ? "falta" : "sobra" };
}

/**
 * Un monto en soles tal como lo tipea el dueño: «26234.67», «26,234.67»,
 * «26.234,67», «S/ 1 713,62». El último separador seguido de 1-2 dígitos es
 * el decimal; los demás son miles. Vacío o ilegible = null (nunca 0).
 */
export function leerSoles(texto: string): number | null {
  const t = texto.replace(/s\/|\s/gi, "");
  if (!/^\d[\d.,]*$/.test(t)) return null;
  const dec = /[.,](\d{1,2})$/.exec(t);
  const entero = dec ? t.slice(0, -dec[0].length) : t;
  // Miles en grupos de 3 («26,234» / «1.000.000») o el número pelado.
  if (!/^(?:\d+|\d{1,3}(?:[.,]\d{3})+)$/.test(entero)) return null;
  const n = Number(`${entero.replace(/[.,]/g, "")}.${dec ? dec[1] : "0"}`);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}
