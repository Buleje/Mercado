/**
 * ctp-cogs — la REGLA de cuánto costó lo que salió, separada de cómo se leen los datos.
 *
 * Vivía adentro de `ForestCtpDespachoDB.cogsDeDespacho`, que la aplicaba sobre datos
 * traídos de a un despacho por vez. El P&L del período necesita lo mismo pero en
 * lote (1 + D×(3+O) queries no escala), y duplicar la regla en dos lugares es
 * exactamente cómo el margen del panel termina diciendo algo distinto del Excel.
 *
 * PURO: recibe los datos ya cargados y decide. Los dos caminos —el de un despacho
 * y el del período entero— usan ESTA función, así no pueden divergir.
 *
 * Regla de oro (ADR-135 D7): si falta un costo el resultado es **null, nunca 0**.
 * Un 0 fingiría margen 100%, que es peor que admitir que no se sabe.
 */

export type MotivoCogs = "ok" | "sin_atribucion" | "falta_costo" | "monedas_mezcladas" | "sin_cantidad";

export interface OrigenParaCogs {
  /** Línea de la corrida de producción de la que salió esta parte. */ lineNo: number;
  /** Cuánto de lo despachado se atribuye a esa corrida. */ quantity: number;
  /** S/ por unidad de esa corrida (null = su costo no se conoce). */ costoUnitario: number | null;
  moneda: string | null;
  congelado: boolean;
}

export interface EntradaCogs {
  /** Cantidad declarada en la línea de despacho. */ declarado: number;
  moneda: string | null;
  origenes: OrigenParaCogs[];
}

export interface ResultadoCogs {
  cogs: number | null;
  costoUnitario: number | null;
  moneda: string | null;
  motivo: MotivoCogs;
  sinAtribuir: number;
  detalle: { lineNo: number; quantity: number; costoUnitario: number | null; costo: number | null; congelado: boolean }[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

/**
 * Aplica la regla del COGS sobre datos ya cargados.
 *
 * El orden de los cortes importa y es el original: monedas mezcladas antes que
 * falta de costo, y falta de costo antes que volumen sin atribuir. Cambiarlo
 * cambia el `motivo` que ve el usuario aunque el `cogs` siga siendo null.
 */
export function decidirCogs(e: EntradaCogs): ResultadoCogs {
  const declarado = e.declarado;
  const atribuido = r4(e.origenes.reduce((a, o) => a + o.quantity, 0));
  const sinAtribuir = r4(Math.max(0, declarado - atribuido));
  const base = { sinAtribuir, moneda: e.moneda ?? "PEN" };

  if (e.origenes.length === 0) {
    return { ...base, cogs: null, costoUnitario: null, motivo: "sin_atribucion", detalle: [] };
  }

  const detalle = e.origenes.map((o) => ({
    lineNo: o.lineNo,
    quantity: o.quantity,
    costoUnitario: o.costoUnitario,
    costo: o.costoUnitario != null ? r2(o.costoUnitario * o.quantity) : null,
    congelado: o.congelado,
  }));

  const monedas = new Set(e.origenes.map((o) => o.moneda ?? "PEN"));
  if (monedas.size > 1) {
    return { ...base, cogs: null, costoUnitario: null, motivo: "monedas_mezcladas", detalle };
  }
  // Una sola corrida sin costo envenena el total: sumar las demás daría un COGS
  // que parece completo y no lo es.
  if (detalle.some((d) => d.costo == null)) {
    return { ...base, cogs: null, costoUnitario: null, motivo: "falta_costo", detalle };
  }
  // Y si hay volumen sin atribuir, tampoco se puede afirmar el costo del despacho
  // entero — sólo el de la parte que sí tiene origen.
  if (sinAtribuir > 0) {
    return { ...base, cogs: null, costoUnitario: null, motivo: "sin_atribucion", detalle };
  }

  const cogs = r2(detalle.reduce((a, d) => a + (d.costo ?? 0), 0));
  return {
    ...base,
    moneda: [...monedas][0],
    cogs,
    costoUnitario: declarado > 0 ? r2(cogs / declarado) : null,
    motivo: declarado > 0 ? "ok" : "sin_cantidad",
    detalle,
  };
}
