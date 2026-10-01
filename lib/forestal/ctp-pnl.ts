/**
 * ctp-pnl — decisión PURA del margen (ADR-141), client-safe y testeable.
 *
 * Regla de oro (ADR-134): si falta la venta O el costo, el margen es null —
 * NUNCA 0. Un 0 fingiría margen 100%/pérdida total, peor que "no sé".
 */

export type MargenMotivo =
  | "ok"
  | "sin_venta"
  | "sin_costo"
  | "sin_atribucion"
  | "falta_costo"
  | "monedas_mezcladas"
  | "sin_cantidad"
  /** ADR-437 §1: madera ajena aserrada por servicio — no hay margen de madera que medir, ni es un faltante. */
  | "madera_de_servicio"
  /** Revisión 26-09: madera propia + de servicio en el mismo despacho — venta nuestra, costo incompleto. */
  | "mixto_servicio";

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Decide el margen de un despacho a partir de la venta y el COGS (ambos pueden
 * ser null) + el motivo por el que el COGS es null (para propagarlo).
 */
export function decidirMargen(
  venta: number | null,
  cogs: number | null,
  cogsMotivo: string,
): { margen: number | null; margenPct: number | null; motivo: MargenMotivo } {
  // Antes que la venta: el despacho de madera ajena no es una venta nuestra (el
  // ingreso es el cobro del aserrío), así que «sin valor de venta» sería otro
  // faltante falso. El MIXTO no entra acá: tiene madera propia, así que es una
  // venta nuestra y sin ella es «sin venta» como cualquier otro despacho.
  if (cogsMotivo === "madera_de_servicio") return { margen: null, margenPct: null, motivo: "madera_de_servicio" };
  if (venta == null) return { margen: null, margenPct: null, motivo: "sin_venta" };
  if (cogs == null) return { margen: null, margenPct: null, motivo: cogsMotivo === "ok" ? "sin_costo" : (cogsMotivo as MargenMotivo) };
  const margen = r2(venta - cogs);
  return { margen, margenPct: venta > 0 ? r2((margen / venta) * 100) : null, motivo: "ok" };
}

/** Un despacho ya decidido (venta, COGS, margen y su motivo), listo para sumar. */
export interface FilaPnl {
  id: string;
  lineNo: number;
  producto: string;
  gtfSalida: string | null;
  valorVenta: number | null;
  cogs: number | null;
  margen: number | null;
  margenPct: number | null;
  moneda: string;
  motivo: MargenMotivo;
  /**
   * `entryDate` del despacho, ISO (ADR-451): con esto el resultado del negocio
   * decide el mes de cada venta con la misma regla que el resto (fecha de
   * calendario). Opcional: las filas armadas a mano (tests, vista previa) no lo traen.
   */
  fecha?: string;
  /**
   * La moneda del DESPACHO (la de `valorVenta`). `moneda` es la del costo que
   * decidió `decidirCogs`: sin costo cae a PEN, y una venta en dólares se sumaba a
   * soles (ADR-451, revisión). Opcional, como `fecha`.
   */
  monedaVenta?: string;
}

/** P&L agregado de un período (ADR-141). El margen cubre SOLO los completos. */
export interface PnlAgregado {
  despachos: number;
  /** Con venta Y costo conocidos → contribuyen al margen. */
  completos: number;
  sinVenta: number;
  /** Sin costo conocido (falta factura, atribución, monedas, o madera mezclada con servicio). */
  sinCosto: number;
  /** De los `sinCosto`, cuántos mezclan madera propia con madera de servicio. */
  mixtos: number;
  /** Despachos de madera ajena (ADR-437 §1): sin margen de madera, y NO son incompletos. */
  deServicio: number;
  /** Σ ventas de los completos — la base del margen %. */
  ventasTotal: number;
  /**
   * Σ ventas registradas de despachos a los que les falta el costo: no entran
   * al margen (no se inventa), pero se dicen — si no, una venta mixta de
   * S/ 9 000 desaparecía del panel sin dejar rastro (revisión 26-09).
   */
  ventasSinMargen: number;
  cogsTotal: number;
  /** Σ(venta − cogs) sobre los completos. */
  margenTotal: number;
  margenPct: number | null;
  moneda: string;
  porProducto: { producto: string; ventas: number; cogs: number; margen: number; margenPct: number | null }[];
  /** Detalle por despacho: para editar la venta y ver el margen fila por fila. */
  porDespacho: Omit<FilaPnl, "moneda">[];
}

/**
 * Suma los despachos del período. PURA: la DB class trae y decide cada fila,
 * acá sólo se cuenta — así la regla de qué es «completo», «incompleto» o «de
 * servicio» vive en un solo lugar y tiene tests.
 */
export function agregarPnl(filas: FilaPnl[]): PnlAgregado {
  let completos = 0, sinVenta = 0, sinCosto = 0, mixtos = 0, deServicio = 0;
  let ventasTotal = 0, ventasSinMargen = 0, cogsTotal = 0, margenTotal = 0;
  const monedas = new Set<string>();
  const prod: Record<string, { producto: string; ventas: number; cogs: number; margen: number }> = {};
  const porDespacho: PnlAgregado["porDespacho"] = [];

  for (const f of filas) {
    monedas.add(f.moneda);
    const { moneda: _moneda, ...fila } = f;
    porDespacho.push(fila);
    if (f.margen == null) {
      // La madera ajena no es un faltante: ni «sin venta» ni «sin costo».
      if (f.motivo === "madera_de_servicio") deServicio++;
      else if (f.motivo === "sin_venta") sinVenta++;
      else {
        sinCosto++;
        if (f.motivo === "mixto_servicio") mixtos++;
        ventasSinMargen += f.valorVenta ?? 0;
      }
      continue;
    }
    completos++;
    ventasTotal += f.valorVenta ?? 0;
    cogsTotal += f.cogs ?? 0;
    margenTotal += f.margen;
    prod[f.producto] ??= { producto: f.producto, ventas: 0, cogs: 0, margen: 0 };
    prod[f.producto].ventas += f.valorVenta ?? 0;
    prod[f.producto].cogs += f.cogs ?? 0;
    prod[f.producto].margen += f.margen;
  }

  return {
    despachos: filas.length,
    completos, sinVenta, sinCosto, mixtos, deServicio,
    ventasTotal: r2(ventasTotal), ventasSinMargen: r2(ventasSinMargen),
    cogsTotal: r2(cogsTotal), margenTotal: r2(margenTotal),
    margenPct: ventasTotal > 0 ? r2((margenTotal / ventasTotal) * 100) : null,
    moneda: monedas.size === 1 ? [...monedas][0] : "PEN",
    porProducto: Object.values(prod)
      .map((p) => ({ ...p, ventas: r2(p.ventas), cogs: r2(p.cogs), margen: r2(p.margen), margenPct: p.ventas > 0 ? r2((p.margen / p.ventas) * 100) : null }))
      .sort((a, b) => b.margen - a.margen),
    porDespacho,
  };
}
