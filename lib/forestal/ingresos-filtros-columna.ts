/**
 * Los autofiltros de CABECERA de la bandeja de Ingresos que no tenían otro
 * control (Brandon, 2026-09-26: «en fecha para buscar la fecha o
 * seleccionarla, en documento para buscar, en N° SNIFFS, en cantidad… y las
 * demás también»).
 *
 * Especie, proveedor, permiso y producto siguen en `facetas`, estado en
 * `statusFilter` y recepción en `recepcionSel`: la cabecera escribe ESOS
 * mismos estados (dos lugares, un filtro). Acá vive sólo lo nuevo, y todo
 * viaja al servidor —la tabla está paginada: filtrar la página en el cliente
 * diría «no hay» de guías que están en la página 3—.
 *
 * Puro: lo usan el hook (a parámetros), la vista (a texto, para el vacío) y
 * los tests.
 */

import type { Rango } from "@/lib/admin/filtros-columna";

export interface FiltrosColumnaIngresos {
  /** N° del documento (GTF), contiene. */
  doc?: string;
  /** N° de constancia SNIFFS, contiene. */
  sniffs?: string;
  /** Tipo de documento (GTF, boleta…), contiene. */
  tipo?: string;
  /** Región o distrito de origen, contiene. */
  origen?: string;
  /** Unidad declarada, contiene. */
  unidad?: string;
  /** Quién registró o validó, contiene. */
  registro?: string;
  /** Fecha del asiento (YYYY-MM-DD). Se cruza con el período del libro. */
  fecha?: Rango<string>;
  /** Fecha del papel (YYYY-MM-DD). */
  fechaGuia?: Rango<string>;
  /** m³ de la GUÍA (la suma de sus asientos, lo que muestra la columna). */
  cantidad?: Rango<number>;
  /** Piezas de la guía (suma). */
  piezas?: Rango<number>;
  /** Con o sin trozas cargadas en el detalle. */
  trozas?: "con" | "sin";
  /** true = sólo las que ya tienen precio. Lo contrario es `facetas.sinCosto`. */
  conCosto?: boolean;
  /**
   * La plata de la guía (ADR-437): `servicio` = madera ajena que sólo se
   * asierra; `sin-pagar` = compras con algo pendiente (sin pagar o parcial);
   * `pagada` = compras saldadas. El estado de pago es derivado: lo calcula el
   * servidor, nunca se filtra la página en el cliente.
   */
  pago?: FiltroPago;
}

export const FILTROS_PAGO = ["servicio", "sin-pagar", "pagada"] as const;
export type FiltroPago = (typeof FILTROS_PAGO)[number];

export const FILTRO_PAGO_LABEL: Record<FiltroPago, string> = {
  servicio: "De servicio",
  "sin-pagar": "Sin pagar",
  pagada: "Pagadas",
};

const TEXTOS = [
  ["doc", "doc", "documento"],
  ["sniffs", "sniffs", "N° SNIFFS"],
  ["tipo", "tipo", "tipo"],
  ["origen", "origen", "origen"],
  ["unidad", "unidad", "unidad"],
  ["registro", "registro", "registró"],
] as const;

const RANGOS = [
  ["fecha", "fecha_desde", "fecha_hasta", "fecha"],
  ["fechaGuia", "gtf_desde", "gtf_hasta", "fecha del documento"],
  ["cantidad", "vol_min", "vol_max", "cantidad (m³)"],
  ["piezas", "pz_min", "pz_max", "piezas"],
] as const;

/** Agrega los parámetros de URL. Un tope vacío (`null`) no viaja. */
export function aplicarFiltrosColumna(params: URLSearchParams, f: FiltrosColumnaIngresos | undefined): URLSearchParams {
  if (!f) return params;
  for (const [k, p] of TEXTOS) {
    const v = f[k]?.trim();
    if (v) params.set(p, v);
  }
  for (const [k, pMin, pMax] of RANGOS) {
    const r = f[k] as Rango<number | string> | undefined;
    if (r?.min != null && r.min !== "") params.set(pMin, String(r.min));
    if (r?.max != null && r.max !== "") params.set(pMax, String(r.max));
  }
  if (f.trozas) params.set("trozas", f.trozas);
  if (f.conCosto) params.set("con_costo", "1");
  if (f.pago) params.set("pago", f.pago);
  return params;
}

const ddmm = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return d && m ? `${d}/${m}${y ? `/${y.slice(2)}` : ""}` : iso;
};

/** Qué está filtrando, con nombre — para el vacío y los chips (ADR-352). */
export function textosDeFiltrosColumna(f: FiltrosColumnaIngresos | undefined): string[] {
  if (!f) return [];
  const out: string[] = [];
  for (const [k, , nombre] of TEXTOS) {
    const v = f[k]?.trim();
    if (v) out.push(`${nombre} «${v}»`);
  }
  for (const [k, , , nombre] of RANGOS) {
    const r = f[k] as Rango<number | string> | undefined;
    const esFecha = k === "fecha" || k === "fechaGuia";
    const fmt = (v: number | string) => (esFecha ? ddmm(String(v)) : String(v));
    if (r?.min != null && r?.max != null) out.push(r.min === r.max ? `${nombre} ${fmt(r.min)}` : `${nombre} ${fmt(r.min)}–${fmt(r.max)}`);
    else if (r?.min != null) out.push(`${nombre} ≥ ${fmt(r.min)}`);
    else if (r?.max != null) out.push(`${nombre} ≤ ${fmt(r.max)}`);
  }
  if (f.trozas) out.push(f.trozas === "con" ? "con trozas" : "sin trozas");
  if (f.conCosto) out.push("con precio");
  if (f.pago) out.push(f.pago === "servicio" ? "de servicio" : f.pago === "sin-pagar" ? "sin pagar" : "pagadas");
  return out;
}

export const hayFiltroDeColumna = (f: FiltrosColumnaIngresos | undefined): boolean => textosDeFiltrosColumna(f).length > 0;
