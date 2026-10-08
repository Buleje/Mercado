/**
 * rendimiento-plata — el rendimiento de una corrida dicho en PLATA (contrato
 * K4 (a), 08-10). PURO y client-safe: sin Prisma ni React.
 *
 * Nada de esto se guarda. Compone lo que ya vive en otras tablas —el costo de
 * la madera (`costoDeLinea`), el flete y los gastos de la guía
 * (`costoPuestoEnPatio`), el aserrío (`costoProceso`), el PT medido y el
 * precio de venta de los paquetes (ADR-429)— y lo divide por el PT aserrado.
 * Guardarlo sería tener un número que se desincroniza con la plata de la guía
 * a la primera corrección.
 *
 * Dos reglas que mandan sobre el diseño:
 *   1. **Lo que falta es `null` y se nombra, nunca 0.** Un costo en 0 fingiría
 *      margen 100 %; por eso cada hueco entra a `faltantes` en palabras («el
 *      costo de la madera») y el número que lo necesitaba queda en null.
 *   2. **Lo estimado se rotula.** El PT Oxapampa pagado sale, en orden, del
 *      sello de la factura, de las trozas cubicadas y, si no hay nada, del m³
 *      geométrico × 424 × 0,624. Ese último es un derivado: `ptEntradaEstimado`
 *      lo marca y la pantalla le pone «≈».
 */
import { formatNumber } from "@/lib/format";
import type { FuentePt } from "./plata-de-guia";
import { decidirMargen } from "./ctp-pnl";
import { PT_POR_M3 } from "./cubicacion";
import { rendimientoDeCorrida } from "./vincular-produccion";

/**
 * PT Oxapampa ÷ PT geométrico. Oxapampa cubica `D²·L / 24,5`; el cilindro, en
 * las mismas unidades, `D²·L / 15,28`. La rolliza que se paga en Oxapampa
 * rinde ≈ 0,624 del volumen geométrico (cubicacion-oxapampa.ts:23).
 */
export const FACTOR_OXAPAMPA_GEOMETRICO = 15.28 / 24.5;

/** De dónde salió el PT de entrada: la factura, las trozas, el ≈ de la guía o el ≈ del m³. */
export type FuentePtEntrada = FuentePt | "estimado-m3";

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const r4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;

/** ≈ PT Oxapampa de una rolliza de `m3` geométricos. Derivado: va con «≈». */
export function ptOxapampaEstimado(m3: number): number {
  return m3 > 0 ? r2(m3 * PT_POR_M3 * FACTOR_OXAPAMPA_GEOMETRICO) : 0;
}

export interface EntradaPlata {
  /** m³ de troza de la corrida (el denominador del rendimiento del libro). */
  m3: number;
  /** PT pagado, prorrateado por m³ consumido de cada guía. `null` = no hay dato: se estima del m³. */
  ptPagado: number | null;
  fuentePt: FuentePtEntrada | null;
  /** `costoDeLinea.costoMateriaPrima`. `null` = falta (sin consumos, sin factura…). */
  costoMadera: number | null;
  /** Flete + gastos de la guía prorrateados (`costoPuestoEnPatio`). `null` si falta o quedó incompleto. */
  costoFleteGastos: number | null;
  /** Madera de un tercero aserrada por servicio: no es nuestra, no tiene costo ni venta que medir. */
  servicio?: boolean;
  /**
   * m³ de la corrida que no salen de ninguna guía (`costoDeLinea.sinAtribuirM3`).
   * > 0 → el costo de la madera y el PT pagado no se saben: los de lo atribuido,
   * divididos por TODO el aserrado, darían un costo por PT más bajo y un
   * comercial más alto que los reales (revisión 1dc55fcad).
   */
  m3SinAtribuir?: number;
  /** Moneda de `costoMadera` (`costoDeLinea.moneda`). Si no es PEN no se suma a soles. */
  monedaMadera?: string | null;
  /** `costoDeLinea.motivo`: sin consumos, la madera sin atribuir YA dice qué falta. */
  motivoMadera?: string | null;
  /** Alguna guía consumida quedó fuera de la lectura por el tope: su flete «no se leyó», no «falta». */
  guiasNoLeidas?: boolean;
}

export interface SalidaPlata {
  m3: number;
  pt: number;
  /** El PT es el MEDIDO en TODOS los paquetes (si no, sale de m³ × 424). */
  ptMedido: boolean;
  /** `ForestCtpEntry.costoProceso`. */
  costoAserrio: number | null;
  /** Σ precioVentaPt × pt de los paquetes; `null` si algún paquete no tiene precio. */
  ventaSoles: number | null;
}

/** Las sumas con las que se agrega (ponderar es sumar numeradores y denominadores). */
export interface BasePlata {
  m3Entrada: number;
  m3Salida: number;
  ptEntrada: number | null;
  ptSalida: number;
  /** madera + flete/gastos + aserrío; `null` si falta alguno. */
  costoTotal: number | null;
  ventaSoles: number | null;
  /** m³ de troza sin guía atribuida: el agregado los suma para nombrar UN faltante. */
  m3SinAtribuir: number;
}

export interface RendimientoPlata {
  /** = `rendimientoDeCorrida`: m³ aserrados ÷ m³ de troza. */
  rendimientoM3Pct: number | null;
  /** Rendimiento COMERCIAL: PT aserrado ÷ PT Oxapampa pagado. */
  rendimientoPtPct: number | null;
  /** S/ por PT aserrado. `null` si falta algún costo. */
  costoPorPt: number | null;
  ventaPorPt: number | null;
  /** Por `decidirMargen`: null si falta la venta o el costo, nunca 0. */
  margenPorPt: number | null;
  /** Lote en proceso (`finProceso` futuro): la salida todavía no es toda. */
  parcial: boolean;
  /** Qué falta para el número, en palabras. Vacío = completo. */
  faltantes: string[];
  /** El PT de entrada es un ≈ (de la guía o del m³), no la factura ni las trozas. */
  ptEntradaEstimado: boolean;
  /** El PT aserrado sale de m³ × 424 en algún paquete (no se midió al cubicar): el costo por PT y el comercial van con «≈». */
  ptSalidaEstimado: boolean;
  servicio: boolean;
  base: BasePlata;
}

export const FALTA = {
  madera: "el costo de la madera",
  flete: "el flete y los gastos de la guía",
  aserrio: "el costo del aserrío",
  ptPagado: "el PT Oxapampa pagado (se estimó del m³)",
  venta: "el precio de venta",
  fleteNoLeido: "el flete de guías que no se leyeron (tope por lectura)",
} as const;

/** Comienzo del faltante de la madera sin guía: el agregado lo junta en uno con la suma. */
export const FALTA_SIN_ATRIBUIR = "la madera sin atribuir a una guía";
export const faltaSinAtribuir = (m3: number): string => `${FALTA_SIN_ATRIBUIR} (${formatNumber(m3, { max: 3 })} m³)`;
export const faltaMonedaMadera = (moneda: string): string => `el costo de la madera en soles (está en ${moneda})`;
export const faltaNoLeidas = (n: number): string => `la plata de ${n} ${n === 1 ? "corrida no leída" : "corridas no leídas"}`;

function porPt(soles: number | null, pt: number): number | null {
  return soles != null && pt > 0 ? r2(soles / pt) : null;
}

/** Arma el número a partir de las sumas: lo usan la corrida y el agregado. */
function desdeBase(
  b: BasePlata,
  o: { parcial: boolean; servicio: boolean; ptEntradaEstimado: boolean; ptSalidaEstimado: boolean; faltantes: string[]; motivoCosto: string },
): RendimientoPlata {
  const rendimientoM3Pct = rendimientoDeCorrida(b.m3Salida, b.m3Entrada, "m3");
  const rendimientoPtPct = b.ptEntrada != null && b.ptEntrada > 0 && b.ptSalida > 0 ? r1((b.ptSalida / b.ptEntrada) * 100) : null;
  if (o.servicio) {
    return {
      rendimientoM3Pct, rendimientoPtPct, costoPorPt: null, ventaPorPt: null, margenPorPt: null,
      parcial: o.parcial, faltantes: [], ptEntradaEstimado: o.ptEntradaEstimado, ptSalidaEstimado: o.ptSalidaEstimado,
      servicio: true, base: b,
    };
  }
  const { margen } = decidirMargen(b.ventaSoles, b.costoTotal, o.motivoCosto);
  return {
    rendimientoM3Pct,
    rendimientoPtPct,
    costoPorPt: porPt(b.costoTotal, b.ptSalida),
    ventaPorPt: porPt(b.ventaSoles, b.ptSalida),
    margenPorPt: porPt(margen, b.ptSalida),
    parcial: o.parcial,
    faltantes: o.faltantes,
    ptEntradaEstimado: o.ptEntradaEstimado,
    ptSalidaEstimado: o.ptSalidaEstimado,
    servicio: false,
    base: b,
  };
}

/** El rendimiento de UNA corrida en m³, en PT y en soles por PT. */
export function rendimientoEnPlata(e: EntradaPlata, s: SalidaPlata, o: { parcial: boolean }): RendimientoPlata {
  const servicio = e.servicio === true;
  /* Madera sin guía: lo atribuido no es toda la troza. Su costo y su PT pagado
     sobre TODO el aserrado mentirían a favor; se dejan en null y se nombra. */
  const sinAtribuir = e.m3SinAtribuir != null && e.m3SinAtribuir > 0 ? r4(e.m3SinAtribuir) : 0;
  /* Dólares no se suman a soles: el costo de la madera queda sin calcular. */
  const otraMoneda = e.costoMadera != null && e.monedaMadera && e.monedaMadera !== "PEN" ? e.monedaMadera : null;
  const costoMadera = sinAtribuir > 0 || otraMoneda ? null : e.costoMadera;
  const ptPagado = sinAtribuir > 0 ? null : e.ptPagado;

  const ptEntrada = ptPagado != null && ptPagado > 0 ? ptPagado : e.m3 > 0 ? ptOxapampaEstimado(e.m3) : null;
  const fuente: FuentePtEntrada | null = ptPagado != null && ptPagado > 0 ? e.fuentePt : ptEntrada != null ? "estimado-m3" : null;
  const ptEntradaEstimado = fuente === "estimado" || fuente === "estimado-m3";

  const faltantes: string[] = [];
  if (!servicio) {
    if (sinAtribuir > 0) faltantes.push(faltaSinAtribuir(sinAtribuir));
    if (otraMoneda) faltantes.push(faltaMonedaMadera(otraMoneda));
    /* Sin consumos, «sin atribuir» ya es TODO lo que falta de la madera. */
    if (e.costoMadera == null && !(sinAtribuir > 0 && e.motivoMadera === "sin_consumos")) faltantes.push(FALTA.madera);
    if (e.costoFleteGastos == null) faltantes.push(e.guiasNoLeidas ? FALTA.fleteNoLeido : FALTA.flete);
    if (s.costoAserrio == null) faltantes.push(FALTA.aserrio);
    if (ptEntradaEstimado) faltantes.push(FALTA.ptPagado);
    if (s.ventaSoles == null) faltantes.push(FALTA.venta);
  }
  const costoTotal =
    costoMadera != null && e.costoFleteGastos != null && s.costoAserrio != null
      ? r2(costoMadera + e.costoFleteGastos + s.costoAserrio)
      : null;

  return desdeBase(
    {
      m3Entrada: r4(e.m3), m3Salida: r4(s.m3), ptEntrada: ptEntrada != null ? r2(ptEntrada) : null, ptSalida: r2(s.pt),
      costoTotal, ventaSoles: s.ventaSoles != null ? r2(s.ventaSoles) : null, m3SinAtribuir: servicio ? 0 : sinAtribuir,
    },
    { parcial: o.parcial, servicio, ptEntradaEstimado, ptSalidaEstimado: !s.ptMedido, faltantes, motivoCosto: costoTotal == null ? "sin_costo" : "ok" },
  );
}

/**
 * Varias corridas como una: PONDERADO (Σ salida ÷ Σ entrada), nunca el
 * promedio de los porcentajes — el promedio simple de Blas da 24,72 y el
 * libro 25,13, y la diferencia es justo la que se leyó como «error de
 * unidades». Un costo o una venta que falte en UNA corrida deja el total en
 * null: sumar lo que hay daría un piso que se lee como el costo.
 *
 * `sinLeer`: corridas del grupo cuya plata no se leyó (tope de la lectura).
 * Cuentan como faltante: el costo, la venta y el PT pagado del grupo quedan en
 * null en vez de ser los de una parte presentados como los de todo.
 */
export function agregarRendimientoPlata(filas: readonly RendimientoPlata[], o: { sinLeer?: number } = {}): RendimientoPlata {
  const sinLeer = o.sinLeer ?? 0;
  const propias = filas.filter((f) => !f.servicio);
  const sum = (xs: readonly RendimientoPlata[], f: (b: BasePlata) => number) => xs.reduce((a, x) => a + f(x.base), 0);
  const todosONull = (xs: readonly RendimientoPlata[], f: (b: BasePlata) => number | null): number | null =>
    xs.length > 0 && xs.every((x) => f(x.base) != null) ? r2(xs.reduce((a, x) => a + (f(x.base) as number), 0)) : null;

  const base: BasePlata = {
    m3Entrada: r4(sum(filas, (b) => b.m3Entrada)),
    m3Salida: r4(sum(filas, (b) => b.m3Salida)),
    ptEntrada: sinLeer === 0 && filas.length > 0 && filas.every((f) => f.base.ptEntrada != null) ? r2(sum(filas, (b) => b.ptEntrada ?? 0)) : null,
    ptSalida: r2(sum(filas, (b) => b.ptSalida)),
    costoTotal: sinLeer > 0 ? null : todosONull(propias, (b) => b.costoTotal),
    ventaSoles: sinLeer > 0 ? null : todosONull(propias, (b) => b.ventaSoles),
    m3SinAtribuir: r4(sum(propias, (b) => b.m3SinAtribuir)),
  };
  /* Un solo «sin atribuir» con la suma, no uno por corrida con su número. */
  const faltantes = [
    ...new Set([
      ...(sinLeer > 0 ? [faltaNoLeidas(sinLeer)] : []),
      ...propias.flatMap((f) => f.faltantes).map((t) => (t.startsWith(FALTA_SIN_ATRIBUIR) ? faltaSinAtribuir(base.m3SinAtribuir) : t)),
    ]),
  ];
  const r = desdeBase(base, {
    parcial: filas.some((f) => f.parcial),
    servicio: filas.length > 0 && propias.length === 0,
    ptEntradaEstimado: filas.some((f) => f.ptEntradaEstimado),
    ptSalidaEstimado: filas.some((f) => f.ptSalidaEstimado),
    faltantes,
    motivoCosto: base.costoTotal == null ? "sin_costo" : "ok",
  });
  /* Costo y venta por PT del agregado: sólo sobre el PT de las corridas propias
     (las de servicio no tienen ni costo ni venta nuestra). */
  if (propias.length !== filas.length && propias.length > 0) {
    const ptPropio = r2(sum(propias, (b) => b.ptSalida));
    const { margen } = decidirMargen(base.ventaSoles, base.costoTotal, base.costoTotal == null ? "sin_costo" : "ok");
    return { ...r, costoPorPt: porPt(base.costoTotal, ptPropio), ventaPorPt: porPt(base.ventaSoles, ptPropio), margenPorPt: porPt(margen, ptPropio) };
  }
  return r;
}

// ── Armar la entrada y la salida desde lo que leen las DB classes ──────────

/** Un consumo de la corrida: de qué asiento (línea de guía) y cuánto. */
export interface ConsumoParaPlata {
  woodEntryId: string;
  gtfNumber: string | null;
  volumeM3: number;
}

/** Una línea de la guía con su PT: el sellado de la factura o el de sus trozas. */
export interface LineaGuiaParaPlata {
  id: string;
  volumeM3: number;
  /** `costoDetalle.ptUsado`: el PT que se pagó, sellado por el servidor (ADR-440 §6). */
  ptSellado: number | null;
  fuenteSellada: FuentePt | null;
  /** `ptPago`: Oxapampa si la línea está cubicada entera; si no, un ≈ que acá no se usa. */
  ptPago: { pt: number; fuente: "oxapampa" | "estimado" } | null;
}

export interface GuiaParaPlata {
  lineas: LineaGuiaParaPlata[];
  /** Σ m³ de las líneas vivas: la base del prorrateo del flete. */
  volumenM3: number;
  /** Fletes del CTP + gastos (`costoPuesto`); `null` si hay un flete sin monto. */
  fleteGastos: number | null;
}

const PESO_FUENTE: Record<FuentePt, number> = { factura: 0, oxapampa: 1, estimado: 2 };

/**
 * La entrada en plata de una corrida. PT pagado: sólo si TODAS las líneas que
 * consumió tienen PT de factura o de trozas (no se mezcla medido con ≈ en una
 * suma); si no, `null` y `rendimientoEnPlata` lo estima del m³ rotulándolo.
 */
export function entradaDePlata(input: {
  m3: number;
  consumos: readonly ConsumoParaPlata[];
  guias: ReadonlyMap<string, GuiaParaPlata | null>;
  costoMadera: number | null;
  motivoMadera: string | null;
  /** `costoDeLinea.sinAtribuirM3`. */
  sinAtribuirM3?: number;
  /** `costoDeLinea.moneda` (la de la madera cuando hay costo). */
  monedaMadera?: string | null;
}): EntradaPlata {
  const { consumos, guias } = input;
  let pt = 0;
  let fuente: FuentePt | null = null;
  let ptCompleto = consumos.length > 0;
  let flete = 0;
  let fleteCompleto = consumos.length > 0;
  /* Una guía que no está en el mapa no se leyó (tope): distinto de leída sin flete. */
  let guiasNoLeidas = false;
  const porGuia = new Map<string, number>();
  for (const c of consumos) {
    const g = c.gtfNumber ? guias.get(c.gtfNumber) ?? null : null;
    const linea = g?.lineas.find((l) => l.id === c.woodEntryId) ?? null;
    const medido =
      linea && linea.ptSellado != null && linea.ptSellado > 0
        ? { pt: linea.ptSellado, fuente: linea.fuenteSellada ?? ("factura" as FuentePt) }
        : linea?.ptPago && linea.ptPago.fuente === "oxapampa" && linea.ptPago.pt > 0
          ? { pt: linea.ptPago.pt, fuente: "oxapampa" as FuentePt }
          : null;
    if (!linea || !medido || !(linea.volumeM3 > 0)) ptCompleto = false;
    else {
      pt += medido.pt * (c.volumeM3 / linea.volumeM3);
      fuente = fuente == null || PESO_FUENTE[medido.fuente] > PESO_FUENTE[fuente] ? medido.fuente : fuente;
    }
    if (c.gtfNumber) porGuia.set(c.gtfNumber, (porGuia.get(c.gtfNumber) ?? 0) + c.volumeM3);
    else fleteCompleto = false;
  }
  for (const [gtf, m3] of porGuia) {
    const g = guias.get(gtf) ?? null;
    if (!guias.has(gtf)) guiasNoLeidas = true;
    if (!g || g.fleteGastos == null || !(g.volumenM3 > 0)) fleteCompleto = false;
    else flete += g.fleteGastos * (m3 / g.volumenM3);
  }
  return {
    m3: input.m3,
    ptPagado: ptCompleto ? r2(pt) : null,
    fuentePt: ptCompleto ? fuente : null,
    costoMadera: input.costoMadera,
    costoFleteGastos: fleteCompleto ? r2(flete) : null,
    servicio: input.motivoMadera === "madera_de_servicio",
    m3SinAtribuir: input.sinAtribuirM3 ?? 0,
    monedaMadera: input.monedaMadera ?? null,
    motivoMadera: input.motivoMadera,
    guiasNoLeidas,
  };
}

/** La salida en plata: PT medido de los paquetes (o m³ × 424) y su venta. */
export function salidaDePlata(input: {
  m3: number;
  paquetes: ReadonlyArray<{ volumenM3: number; pieTablar: number | null; precioVentaPt: number | null }>;
  costoProceso: number | null;
}): SalidaPlata {
  const { paquetes } = input;
  const ptDe = (p: (typeof paquetes)[number]) => (p.pieTablar != null && p.pieTablar > 0 ? p.pieTablar : p.volumenM3 * PT_POR_M3);
  const pt = paquetes.length > 0 ? paquetes.reduce((a, p) => a + ptDe(p), 0) : input.m3 * PT_POR_M3;
  const conPrecio = paquetes.length > 0 && paquetes.every((p) => p.precioVentaPt != null && p.precioVentaPt > 0);
  return {
    m3: input.m3,
    pt: r2(pt),
    ptMedido: paquetes.length > 0 && paquetes.every((p) => p.pieTablar != null && p.pieTablar > 0),
    costoAserrio: input.costoProceso,
    ventaSoles: conPrecio ? r2(paquetes.reduce((a, p) => a + (p.precioVentaPt as number) * ptDe(p), 0)) : null,
  };
}
