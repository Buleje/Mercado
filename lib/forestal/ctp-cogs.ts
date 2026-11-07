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
 *
 * Madera de servicio (ADR-437 §1): lo que se aserró con madera ajena (WASACO
 * en Blas) no lleva costo de madera — no se compró; el ingreso es el servicio.
 * Su COGS también es null, pero con motivo `madera_de_servicio`: NO es un
 * faltante (no hay factura que esperar) y no se cuenta como «sin costo».
 */

export type MotivoCogs =
  | "ok"
  | "sin_atribucion"
  | "falta_costo"
  | "monedas_mezcladas"
  | "sin_cantidad"
  | "madera_de_servicio"
  /**
   * El despacho mezcla madera propia (con costo) y madera de servicio, o sale
   * de una corrida que las mezcla. Es INCOMPLETO: la venta es nuestra y cuenta,
   * la parte propia se costea (`cogsPropio`), la de servicio no lleva costo de
   * madera — y el despacho entero no tiene un COGS honesto (revisión 26-09).
   */
  | "mixto_servicio";

export interface OrigenParaCogs {
  /** Línea de la corrida de producción de la que salió esta parte. */ lineNo: number;
  /** Cuánto de lo despachado se atribuye a esa corrida. */ quantity: number;
  /** S/ por unidad de esa corrida (null = su costo no se conoce). */ costoUnitario: number | null;
  moneda: string | null;
  congelado: boolean;
  /**
   * La corrida se aserró con madera ajena (guía de servicio, o corrida «de
   * tercero» sin costo propio): no hay costo de madera que esperar. Opcional:
   * sin el dato, la corrida se trata como comprada (el comportamiento de antes).
   */
  maderaDeServicio?: boolean;
  /**
   * La corrida consumió madera propia Y de servicio (`costoDeLinea` → motivo
   * `mixto_servicio`): su costo por unidad no se puede separar por dueño, pero
   * no es una factura faltante. Hace mixto al despacho.
   */
  mezclaServicio?: boolean;
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
  /**
   * Sólo con `mixto_servicio`: el costo de la parte comprada, que sí se sabe.
   * null si una corrida mixta impide separarlo. NUNCA entra al margen.
   */
  cogsPropio: number | null;
  sinAtribuir: number;
  detalle: {
    lineNo: number;
    quantity: number;
    costoUnitario: number | null;
    costo: number | null;
    congelado: boolean;
    /** La pantalla la rotula «servicio» en vez de «sin costo». */
    maderaDeServicio: boolean;
    /** Corrida que mezcla madera propia y ajena: la pantalla dice «mixta». */
    mezclaServicio: boolean;
  }[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

/**
 * Aplica la regla del COGS sobre datos ya cargados.
 *
 * El orden de los cortes importa y es el original: monedas mezcladas antes que
 * falta de costo, y falta de costo antes que volumen sin atribuir. Cambiarlo
 * cambia el `motivo` que ve el usuario aunque el `cogs` siga siendo null.
 *
 * La madera de servicio va DESPUÉS de todos ellos: una corrida comprada sin
 * factura sigue siendo un faltante aunque el despacho mezcle una de servicio
 * (si no, la marca de servicio escondería una factura que sí falta), y el
 * volumen sin corrida sigue siendo un hueco de la cadena. Sólo cuando lo
 * comprado está completo se decide entre dos: TODO de servicio → «de
 * servicio» (no es faltante); algo propio + algo de servicio → «mixto»: el
 * COGS igual es null (la venta cubre el despacho entero y el costo de la parte
 * comprada solo daría un margen inflado), pero es un INCOMPLETO que se avisa,
 * no un servicio que se esconde (revisión 26-09: una venta de S/ 9 000 salía
 * del P&L sin contarse en ningún lado).
 */
export function decidirCogs(e: EntradaCogs): ResultadoCogs {
  const declarado = e.declarado;
  const atribuido = r4(e.origenes.reduce((a, o) => a + o.quantity, 0));
  const sinAtribuir = r4(Math.max(0, declarado - atribuido));
  const base = { sinAtribuir, moneda: e.moneda ?? "PEN", cogsPropio: null };

  if (e.origenes.length === 0) {
    return { ...base, cogs: null, costoUnitario: null, motivo: "sin_atribucion", detalle: [] };
  }

  const detalle = e.origenes.map((o) => ({
    lineNo: o.lineNo,
    quantity: o.quantity,
    costoUnitario: o.costoUnitario,
    costo: o.costoUnitario != null ? r2(o.costoUnitario * o.quantity) : null,
    congelado: o.congelado,
    maderaDeServicio: o.maderaDeServicio === true,
    mezclaServicio: o.mezclaServicio === true && o.maderaDeServicio !== true,
  }));

  // La de servicio no tiene costo ni moneda de compra: no entra a esas dos preguntas.
  const compradas = e.origenes.filter((o) => o.maderaDeServicio !== true);
  const monedas = new Set(compradas.map((o) => o.moneda ?? "PEN"));
  if (monedas.size > 1) {
    return { ...base, cogs: null, costoUnitario: null, motivo: "monedas_mezcladas", detalle };
  }
  // Una sola corrida sin costo envenena el total: sumar las demás daría un COGS
  // que parece completo y no lo es.
  // La corrida mixta tampoco es un faltante: su costo no se separa por dueño.
  if (detalle.some((d) => !d.maderaDeServicio && !d.mezclaServicio && d.costo == null)) {
    return { ...base, cogs: null, costoUnitario: null, motivo: "falta_costo", detalle };
  }
  // Y si hay volumen sin atribuir, tampoco se puede afirmar el costo del despacho
  // entero — sólo el de la parte que sí tiene origen.
  if (sinAtribuir > 0) {
    return { ...base, cogs: null, costoUnitario: null, motivo: "sin_atribucion", detalle };
  }
  if (compradas.length === 0) {
    return { ...base, cogs: null, costoUnitario: null, motivo: "madera_de_servicio", detalle };
  }
  if (compradas.length < e.origenes.length || detalle.some((d) => d.mezclaServicio)) {
    const cogsPropio = detalle.some((d) => d.mezclaServicio)
      ? null
      : r2(detalle.reduce((a, d) => a + (d.maderaDeServicio ? 0 : (d.costo ?? 0)), 0));
    return { ...base, cogs: null, costoUnitario: null, motivo: "mixto_servicio", cogsPropio, detalle };
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

/**
 * ¿Esta corrida salió de madera ajena (ADR-437 §1)? Dos caminos (el segundo
 * es el que hoy tiene Blas):
 *  · consumió una guía marcada de servicio (`costoDeLinea` → motivo
 *    `madera_de_servicio`);
 *  · se declaró «de tercero» (aserrío por encargo, ADR-412) y no tiene costo
 *    propio — las 30 corridas de WASACO no consumen guía alguna, así que su
 *    costo daba `sin_consumos` y el despacho decía «falta costo».
 * Una corrida de tercero CON costo conocido no se toca: la marca no esconde un
 * número que sí existe. Tampoco una de tercero a la que le falta una factura
 * (`falta_factura`) o mezcla monedas: esa corrida SÍ consumió madera comprada,
 * y marcarla de servicio escondía el faltante (revisión 26-09).
 */
export function corridaDeServicio(c: {
  motivo: string;
  costoUnitario: number | null;
  duenoMadera?: string | null;
}): boolean {
  if (c.motivo === "madera_de_servicio") return true;
  return c.duenoMadera === "tercero" && c.costoUnitario == null && c.motivo === "sin_consumos";
}

/** ¿La corrida mezcló madera propia y de servicio? (`costoDeLinea` → `mixto_servicio`). */
export function corridaMixta(c: { motivo: string; costoUnitario: number | null }): boolean {
  return c.motivo === "mixto_servicio";
}
