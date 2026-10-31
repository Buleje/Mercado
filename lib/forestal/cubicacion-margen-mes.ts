/**
 * Margen del mes (Cubicador › Guardadas, Brandon 24-10): el «Margen del
 * camión» de cada guardada del mes, juntado por comunidad o por comprador.
 *
 * NO es otra fórmula: cada camión pasa por `armarMargen` con las mismas
 * entradas que su detalle —la venta y la compra de su lote (`cubicacionRefId`),
 * las compras de su comunidad como las da el servidor con
 * `?parte=&conBeneficiario=1`, el precio anotado a mano si lo hay
 * (`armarMargenGuardado`: la compra del lote le gana) y el rendimiento de la GTF con TODAS sus guardadas—. La
 * fila sólo suma lo que da cada camión. El que no tiene precio de compra (o de
 * venta) NO entra en la suma: se cuenta aparte, no se pone en 0.
 *
 * El mes sale de la `fecha` de la cubicación (date-only «AAAA-MM-DD», la del
 * trabajo): se corta el texto, sin pasar por `Date` (nada de corrimiento de Lima).
 * Pura: sin base ni React.
 */
import {
  armarMargenGuardado, guardadaParaMargen, precioGuardado, rendimientoDelCruce,
  type ComercialParaMargen, type MargenDelCamion, type RendimientoParaConvertir,
} from "./cubicacion-margen";
import type { CubicacionRegistro } from "./cubicacion-registro";
import { CLAVE_SIN_DATO, clasificar, type PorFicha } from "./cubicacion-por-ficha";
import { cruzarConGuia, piezasDeLaMismaGuia, type VolumenDeGuia } from "./cubicacion-rendimiento-guia";
import { claveNumeroGtf } from "./gtf-talonario";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"] as const;
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** «2026-10» de una fecha date-only; lo que no es fecha → «». */
export const mesDe = (fecha: string): string => (/^\d{4}-\d{2}/.test(fecha) ? fecha.slice(0, 7) : "");

/** «2026-10» → «octubre 2026». */
export function nombreDelMes(mes: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(mes);
  const nombre = m ? MESES[Number(m[2]) - 1] : undefined;
  return m && nombre ? `${nombre} ${m[1]}` : mes;
}

/** Los meses para elegir: el actual siempre, más los que tienen guardadas; el más nuevo primero. */
export function mesesParaElegir(lista: readonly Pick<CubicacionRegistro, "fecha">[], mesActual: string): string[] {
  return [...new Set([mesActual, ...lista.map((c) => mesDe(c.fecha))].filter(Boolean))].sort((a, b) => b.localeCompare(a));
}

/**
 * Las compras de una comunidad tal como las devuelve el servidor con
 * `?parte=X&conBeneficiario=1`: las de la ficha X o las del beneficiario de
 * Adelantos atado a ella (`forestPartyId`). Sin la ficha, todas (como el detalle).
 */
export function deLaComunidad(
  todas: readonly ComercialParaMargen[],
  parteId: string | undefined,
  beneficiariosDeLaParte: ReadonlyMap<string, readonly string[]>,
): ComercialParaMargen[] {
  if (!parteId) return [...todas];
  const benef = new Set(beneficiariosDeLaParte.get(parteId) ?? []);
  return todas.filter((c) => c.parteId === parteId || (c.beneficiarioId != null && benef.has(c.beneficiarioId)));
}

/** El rendimiento de la GTF de una guardada, con todas las guardadas de esa guía (como el detalle). */
export function rendimientoDeLaGuardada(
  c: CubicacionRegistro,
  lista: readonly CubicacionRegistro[],
  guias: ReadonlyMap<string, VolumenDeGuia>,
  cargandoGuias: boolean,
): RendimientoParaConvertir {
  const numero = c.gtfNumber?.trim();
  if (!numero) return { falta: "falta el rendimiento: esta cubicación no tiene GTF" };
  if (cargandoGuias) return { falta: "todavía estoy leyendo la guía" };
  const guia = guias.get(claveNumeroGtf(numero) ?? "");
  if (!guia) return { falta: `falta el rendimiento: no encuentro la GTF ${numero} entre las emitidas` };
  const juntas = piezasDeLaMismaGuia(c, lista);
  return rendimientoDelCruce(numero, cruzarConGuia(guia, juntas.piezas), juntas.cubicaciones.length);
}

export interface CamionDelMes {
  id: string;
  nombre: string;
  /** null = no entra en la suma; `falta` dice por qué. */
  margen: MargenDelCamion | null;
  falta: "compra" | "venta" | null;
  /** La compra es el precio anotado a mano. */
  aMano: boolean;
  /** Tiene precio anotado a mano pero manda la compra del lote (registrada después): el anotado queda de respaldo. */
  respaldo: boolean;
  /** Un derivado: compra por la GTF (precio por PT × los PT de ESTE camión), compra convertida (troza → PT) o venta todavía sin cobrar. */
  derivado: boolean;
}

export interface EntradasDelMes {
  /** TODAS las guardadas: el mes se filtra acá y el rendimiento de una GTF suma todos sus camiones. */
  lista: readonly CubicacionRegistro[];
  mes: string;
  por: PorFicha;
  /** Las comerciales del negocio (`?material=todas`, una lectura). */
  comerciales: readonly ComercialParaMargen[];
  /** forestPartyId → ids de los beneficiarios de Adelantos atados a esa ficha. */
  beneficiariosDeLaParte: ReadonlyMap<string, readonly string[]>;
  guias: ReadonlyMap<string, VolumenDeGuia>;
  cargandoGuias: boolean;
}

/** El margen de UNA guardada con lo leído para todo el mes: el mismo `armarMargen` del detalle. */
export function margenDeLaGuardada(c: CubicacionRegistro, e: Omit<EntradasDelMes, "mes" | "por">): CamionDelMes {
  const parteId = c.ficha?.comunidadParteId?.trim() || undefined;
  const r = armarMargenGuardado({
    guardada: guardadaParaMargen(c),
    deLaRef: e.comerciales.filter((x) => x.cubicacionRefId === c.id),
    deLaComunidad: deLaComunidad(e.comerciales, parteId, e.beneficiariosDeLaParte),
    comunidadParteId: parteId,
    precioAMano: precioGuardado(c.compraAMano),
    rendimiento: rendimientoDeLaGuardada(c, e.lista, e.guias, e.cargandoGuias),
  });
  const compra = r.compra?.ok ? r.compra.compra : null;
  const venta = r.venta.ok ? r.venta.venta : null;
  return {
    id: c.id,
    nombre: c.nombre,
    margen: r.margen,
    falta: !compra ? "compra" : !venta ? "venta" : null,
    aMano: compra?.origen === "a-mano",
    respaldo: r.respaldo,
    derivado: Boolean(r.margen && ((compra && (compra.origen === "guia" || compra.conversion.tipo !== "directa")) || venta?.fuente === "cubicador")),
  };
}

export interface SumaDelMargen {
  /** Las guardadas del mes en la fila (todas, con o sin margen). */
  camiones: number;
  /** Las que entran en la suma (con precio de compra y de venta). */
  conMargen: number;
  /** PT, venta, compra y margen: SÓLO de las que entran. */
  pt: number;
  venta: number;
  compra: number;
  margen: number;
  /** Margen ÷ venta, en %; null sin venta. */
  pct: number | null;
  sinCompra: number;
  sinVenta: number;
  aMano: number;
  /** Con precio a mano que NO se usó: manda la compra del lote. */
  respaldo: number;
  derivados: number;
  /** Las que no entran y por qué (para decir cuáles abrir). */
  fuera: { id: string; nombre: string; falta: "compra" | "venta" }[];
}

export interface FilaMargenDelMes extends SumaDelMargen {
  clave: string;
  etiqueta: string;
  /** La fila de las guardadas sin ese dato en la ficha. */
  sin: boolean;
}

const vacia = (): SumaDelMargen => ({ camiones: 0, conMargen: 0, pt: 0, venta: 0, compra: 0, margen: 0, pct: null, sinCompra: 0, sinVenta: 0, aMano: 0, respaldo: 0, derivados: 0, fuera: [] });

function sumar(s: SumaDelMargen, c: CamionDelMes): void {
  s.camiones += 1;
  if (c.falta === "compra") s.sinCompra += 1;
  if (c.falta === "venta") s.sinVenta += 1;
  if (c.falta) s.fuera.push({ id: c.id, nombre: c.nombre, falta: c.falta });
  if (c.respaldo) s.respaldo += 1;
  if (!c.margen) return;
  s.conMargen += 1;
  s.pt += c.margen.pt;
  s.venta += c.margen.ventaTotal;
  s.compra += c.margen.compraTotal;
  s.margen += c.margen.camion;
  if (c.aMano) s.aMano += 1;
  if (c.derivado) s.derivados += 1;
}

const cerrar = <T extends SumaDelMargen>(s: T): T => {
  const venta = r2(s.venta);
  const margen = r2(s.margen);
  return { ...s, pt: r2(s.pt), venta, compra: r2(s.compra), margen, pct: venta > 0 ? Math.round((margen / venta) * 1000) / 10 : null };
};

/** Una fila por comunidad o por comprador (la clave de «Cuánto salió de cada…»), de más a menos margen; «sin dato» al final. */
export function margenDelMes(e: EntradasDelMes): { filas: FilaMargenDelMes[]; total: SumaDelMargen; camiones: CamionDelMes[] } {
  const delMes = e.lista.filter((c) => mesDe(c.fecha) === e.mes);
  const claves = clasificar(delMes, e.por);
  const camiones = delMes.map((c) => margenDeLaGuardada(c, e));
  const filas = new Map<string, FilaMargenDelMes>();
  const total = vacia();
  camiones.forEach((cam) => {
    const k = claves.get(cam.id) ?? { clave: CLAVE_SIN_DATO, etiqueta: "" };
    const sin = k.clave === CLAVE_SIN_DATO;
    const f = filas.get(k.clave) ?? { ...vacia(), clave: k.clave, etiqueta: sin ? (e.por === "comunidad" ? "Sin comunidad" : "Sin comprador") : k.etiqueta, sin };
    sumar(f, cam);
    sumar(total, cam);
    filas.set(k.clave, f);
  });
  return {
    filas: [...filas.values()]
      .map(cerrar)
      .sort((a, b) => Number(a.sin) - Number(b.sin) || b.margen - a.margen || b.camiones - a.camiones || a.etiqueta.localeCompare(b.etiqueta, "es")),
    total: cerrar(total),
    camiones,
  };
}
