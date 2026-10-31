/**
 * Margen del camión (Cubicador › «Ver detalle», Brandon 24-10): lo que le
 * vendiste al comprador contra lo que le pagaste a la comunidad, por PT y por
 * el camión entero. SÓLO LECTURA y de pantalla: no se guarda ni mueve plata.
 *
 * De dónde sale cada número:
 * - VENTA: la cubicación comercial de venta que referencia esta guardada
 *   (`cubicacionRefId`) con su `monto`, el de la base (se pone al aplicarla).
 *   Si no está valorizada, el `valor` congelado de la guardada: el precio del
 *   cubicador, todavía sin cobrar, y se dice.
 * - COMPRA: la compra del MISMO lote (`cubicacionRefId`) o, si no hay, la(s)
 *   de la comunidad con la misma GTF; si tampoco, la que elija el usuario o un
 *   precio por PT escrito a mano (sólo para mirar).
 * - Troza por m³ (Smalian) → PT aserrado con el rendimiento de la GTF
 *   (`cruzarConGuia`): un derivado, y se dice. La Oxapampina ya es PT: se
 *   compara PT con PT.
 *
 * Margen por PT = venta por PT − compra por PT; margen del camión = margen por
 * PT × PT del camión (= venta − compra equivalente); % = margen ÷ venta.
 * Pura: sin base ni React.
 */
import { PT_POR_M3 } from "./cubicacion";
import type { CompraAMano, CubicacionRegistro } from "./cubicacion-registro";
import type { CruceConGuia } from "./cubicacion-rendimiento-guia";
import { puedeSerLaMismaGtf } from "./gtf-talonario";

/** Lo que el margen lee de una cubicación comercial (`CubicacionTrozasResumen` lo cumple). */
export interface ComercialParaMargen {
  id: string;
  codigo: string;
  fecha: string;
  sentido: "compra" | "venta";
  estado: "borrador" | "aplicada" | "anulada";
  material: "troza" | "aserrada";
  formula: "smalian" | "oxapampina" | "tablar";
  unidad: "PT" | "m³";
  volumen: number;
  /** NULL = sin valorizar (borrador): no hay precio. */
  monto: number | null;
  gtfNumber: string | null;
  parteId: string | null;
  /** El beneficiario de Adelantos (el margen del mes junta por él las de la comunidad, como `?conBeneficiario=1`). */
  beneficiarioId?: string | null;
  personaNombre: string | null;
  cubicacionRefId: string | null;
}

export interface GuardadaParaMargen {
  id: string;
  gtfNumber?: string;
  /** Valor congelado al guardar (Σ PT × precio de cada pieza). */
  valor: number;
  pt: number;
}

/** El rendimiento de la GTF con que se pasa el m³ de troza a PT aserrado, o qué falta para tenerlo. */
export type RendimientoParaConvertir = { pct: number; gtf: string; /** Cuántas guardadas de esa GTF se sumaron (1 = sólo ésta). */ camiones?: number } | { falta: string };

/** Lo que el margen lee de una guardada: lo mismo en el detalle y en el margen del mes. */
export const guardadaParaMargen = (c: Pick<CubicacionRegistro, "id" | "gtfNumber" | "valor" | "totales">): GuardadaParaMargen =>
  ({ id: c.id, gtfNumber: c.gtfNumber, valor: c.valor, pt: c.totales.pieTablar });

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const viva = (c: ComercialParaMargen) => c.estado !== "anulada";

/* ── Venta ──────────────────────────────────────────────────────────────── */

export interface VentaDelCamion {
  /** «cuenta» = el monto valorizado en la cuenta del comprador; «cubicador» = el valor de la guardada, sin cobrar. */
  fuente: "cuenta" | "cubicador";
  porPt: number;
  pt: number;
  total: number;
  /** La de la cuenta: la valorizada, o la que está en borrador cuando el precio sale del cubicador. */
  cub: ComercialParaMargen | null;
}

export type ResultadoVenta = { ok: true; venta: VentaDelCamion } | { ok: false; falta: string };

export function ventaDelCamion(g: GuardadaParaMargen, deLaRef: readonly ComercialParaMargen[]): ResultadoVenta {
  const ventas = deLaRef.filter((c) => c.cubicacionRefId === g.id && c.sentido === "venta" && viva(c));
  const valorizada = ventas.find((c) => c.monto != null && c.monto > 0 && c.volumen > 0 && c.unidad === "PT");
  if (valorizada?.monto != null) {
    return { ok: true, venta: { fuente: "cuenta", porPt: valorizada.monto / valorizada.volumen, pt: valorizada.volumen, total: valorizada.monto, cub: valorizada } };
  }
  const enCuenta = ventas[0] ?? null;
  if (g.valor > 0 && g.pt > 0) {
    return { ok: true, venta: { fuente: "cubicador", porPt: g.valor / g.pt, pt: g.pt, total: g.valor, cub: enCuenta } };
  }
  return {
    ok: false,
    falta: enCuenta
      ? `Falta el precio de venta: ${enCuenta.codigo} sigue sin valorizar y la cubicación se guardó sin precio.`
      : "Falta el precio de venta: se guardó sin precio y no está en la cuenta del comprador.",
  };
}

/* ── Compra ─────────────────────────────────────────────────────────────── */

export type OrigenDeCompra = "lote" | "guia" | "elegida" | "a-mano";

export type ConversionDeCompra =
  | { tipo: "directa" }
  | { tipo: "oxapampina" }
  | { tipo: "rendimiento"; porM3: number; pct: number; gtf: string; camiones?: number };

export interface CompraDelCamion {
  origen: OrigenDeCompra;
  /** S/ por PT aserrado (o su equivalente, si hubo conversión). */
  porPt: number;
  /** Vacío = escrita a mano. */
  cubs: ComercialParaMargen[];
  /** Σ monto (de la base) y Σ volumen en su unidad; null a mano. */
  monto: number | null;
  volumen: number | null;
  unidad: "PT" | "m³" | null;
  conversion: ConversionDeCompra;
}

export type ResultadoCompra = { ok: true; compra: CompraDelCamion } | { ok: false; falta: string };

/**
 * La compra que calza sola: la del mismo lote o, si no, las de la comunidad
 * con la misma GTF (`puedeSerLaMismaGtf`, la regla de los frenos de plata).
 * `comunidadParteId` filtra también acá, aunque el servidor ya lo haga.
 */
export function comprasQueCalzan(
  g: GuardadaParaMargen,
  deLaRef: readonly ComercialParaMargen[],
  deLaComunidad: readonly ComercialParaMargen[],
  comunidadParteId?: string,
): { origen: "lote" | "guia"; cubs: ComercialParaMargen[] } | null {
  const delLote = deLaRef.filter((c) => esCompraDelLote(c, g.id));
  if (delLote.length > 0) return { origen: "lote", cubs: delLote };
  const gtf = g.gtfNumber?.trim();
  /* Sin la ficha de la comunidad la lista son TODAS las compras del negocio: no se
     elige sola la de otra persona porque comparte la GTF (revisión 24-10). */
  if (!gtf || !comunidadParteId) return null;
  /* La compra que ya es el lote de OTRO camión no se toma por la GTF: dos camiones de
     la misma guía y comunidad contaban la misma compra dos veces (revisión 24-10). */
  const deLaGuia = comprasParaElegir(deLaComunidad, comunidadParteId).filter(
    (c) => puedeSerLaMismaGtf(c.gtfNumber, gtf) && (!c.cubicacionRefId || c.cubicacionRefId === g.id),
  );
  return deLaGuia.length > 0 ? { origen: "guia", cubs: deLaGuia } : null;
}

const esCompraDelLote = (c: ComercialParaMargen, id: string) => c.cubicacionRefId === id && c.sentido === "compra" && viva(c);

/** Hay una compra viva atada a ESTE lote (`cubicacionRefId`): manda sobre el precio anotado a mano. */
export const hayCompraDelLote = (id: string, deLaRef: readonly ComercialParaMargen[]): boolean =>
  deLaRef.some((c) => esCompraDelLote(c, id));

/** Las compras vivas para elegir a mano, la más nueva primero. */
export function comprasParaElegir(lista: readonly ComercialParaMargen[], comunidadParteId?: string): ComercialParaMargen[] {
  return lista
    /* `parteId` null = guardada sólo con el beneficiario atado a esa ficha (el servidor ya la filtró por la comunidad). */
    .filter((c) => c.sentido === "compra" && viva(c) && (!comunidadParteId || c.parteId === comunidadParteId || c.parteId == null))
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.codigo.localeCompare(a.codigo));
}

const claseDeUnidad = (c: ComercialParaMargen): ConversionDeCompra["tipo"] =>
  c.unidad === "m³" ? "rendimiento" : c.material === "troza" ? "oxapampina" : "directa";

/** De una o varias compras de la base a S/ por PT aserrado. */
export function compraDesdeCuentas(
  cubs: readonly ComercialParaMargen[],
  origen: Exclude<OrigenDeCompra, "a-mano">,
  rendimiento: RendimientoParaConvertir,
): ResultadoCompra {
  if (cubs.length === 0) return { ok: false, falta: "No hay compra elegida." };
  const codigos = cubs.map((c) => c.codigo).join(" + ");
  const sinValor = cubs.filter((c) => c.monto == null || c.monto <= 0);
  if (sinValor.length > 0) {
    return { ok: false, falta: `La compra ${sinValor.map((c) => c.codigo).join(" + ")} sigue sin valorizar (sin descontar): todavía no tiene precio. Elige otra o escribe el precio por PT.` };
  }
  const clases = new Set(cubs.map(claseDeUnidad));
  if (clases.size > 1) {
    const que = clases.has("rendimiento") ? "m³ de troza y PT" : "PT Oxapampa de troza y PT aserrado";
    return { ok: false, falta: `${codigos} mezclan ${que}: elige una sola compra.` };
  }
  const monto = cubs.reduce((a, c) => a + (c.monto ?? 0), 0);
  const volumen = cubs.reduce((a, c) => a + c.volumen, 0);
  if (!(volumen > 0)) return { ok: false, falta: `${codigos} no tiene volumen: no hay con qué sacar el precio.` };
  const clase = [...clases][0];
  const base = { origen, cubs: [...cubs], monto: r2(monto), volumen, unidad: cubs[0].unidad };
  if (clase !== "rendimiento") {
    return { ok: true, compra: { ...base, porPt: monto / volumen, conversion: { tipo: clase } } };
  }
  if ("falta" in rendimiento) {
    return { ok: false, falta: `${codigos} es por m³ de troza y para pasarlo a PT aserrado ${rendimiento.falta}. Escribe el precio por PT a mano.` };
  }
  const porM3 = monto / volumen;
  return {
    ok: true,
    compra: {
      ...base,
      porPt: porM3 / ((rendimiento.pct / 100) * PT_POR_M3),
      conversion: { tipo: "rendimiento", porM3, pct: rendimiento.pct, gtf: rendimiento.gtf, camiones: rendimiento.camiones },
    },
  };
}

/** «1,80» / «1.80» / « 2 » → número; vacío, cero, negativo o basura → null. */
export function precioEscrito(texto: string): number | null {
  const t = texto.trim().replace(/\s+/g, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return n > 0 && n < 100_000 ? n : null;
}

/**
 * El rendimiento que sirve para convertir, sacado del cruce con la guía. Más
 * de 100 % no puede ser (cubicación o guía mal): no se convierte con eso.
 */
export function rendimientoDelCruce(numero: string, cruce: CruceConGuia, camiones = 1): RendimientoParaConvertir {
  if (cruce.tipo !== "trozas") return { falta: `falta el rendimiento: la GTF ${numero} es de madera aserrada, no de troza` };
  const pct = cruce.total.rendimientoPct;
  if (pct === null || !(pct > 0)) return { falta: `falta el rendimiento: la GTF ${numero} no declara m³ de troza` };
  if (pct > 100) return { falta: `el rendimiento de la GTF ${numero} da ${pct} % (más de 100 % no puede ser): revisa la cubicación o la guía` };
  /* Para convertir, el % SIN redondear (PT ÷ 424 ÷ m³ de la guía): con el de una
     décima, 2 camiones de 2.000 PT daban S/ 2 de más en el margen. */
  const t = cruce.total;
  const exacto = t.m3Guia > 0 && t.pt > 0 ? (t.pt / PT_POR_M3 / t.m3Guia) * 100 : pct;
  return { pct: exacto, gtf: numero, camiones };
}

/* ── Margen ─────────────────────────────────────────────────────────────── */

export interface MargenDelCamion {
  porPt: number;
  /** Venta − compra equivalente (compra por PT × PT del camión). */
  camion: number;
  /** Margen ÷ precio de venta, en %. */
  pct: number | null;
  pt: number;
  ventaTotal: number;
  compraTotal: number;
}

export function margenDelCamion(
  venta: Pick<VentaDelCamion, "porPt" | "pt" | "total">,
  compra: Pick<CompraDelCamion, "porPt"> & Partial<Pick<CompraDelCamion, "origen" | "monto" | "conversion">>,
): MargenDelCamion {
  const ventaTotal = r2(venta.total);
  /* La compra del MISMO lote en PT trae su monto de la base: ése es el costo del
     camión, aunque el comprador haya recibido menos PT que los comprados
     (revisión 24-10: 2.000 PT a 1,50 = 3.000, venta 1.900 PT → margen 1.750, no 1.900). */
  const montoReal = compra.origen === "lote" && compra.monto != null && compra.conversion?.tipo === "directa" ? compra.monto : null;
  const compraTotal = montoReal ?? r2(compra.porPt * venta.pt);
  const camion = r2(ventaTotal - compraTotal);
  const porPt = montoReal != null && venta.pt > 0 ? camion / venta.pt : venta.porPt - compra.porPt;
  return {
    porPt: r2(porPt),
    camion,
    pct: venta.porPt > 0 ? Math.round((porPt / venta.porPt) * 1000) / 10 : null,
    pt: venta.pt,
    ventaTotal,
    compraTotal,
  };
}

/** Lo que eligió el usuario: «» = la que calza sola, «mano» = el precio escrito, o el id de una compra. */
export type EleccionDeCompra = "" | "mano" | (string & {});

/** Admin y dueño ven el margen y su precio de compra a mano: la MISMA lista en el servidor (GET, POST, PATCH) y en la pantalla. */
export const ROLES_QUE_VEN_EL_MARGEN: readonly string[] = ["admin", "owner"];
export const veElMargen = (rol: string | null | undefined): boolean => rol != null && ROLES_QUE_VEN_EL_MARGEN.includes(rol);

/** El precio anotado a mano como texto del campo («» si no hay). */
export const precioGuardado = (compra: Pick<CompraAMano, "precioPt"> | null | undefined): string =>
  compra && compra.precioPt > 0 ? String(compra.precioPt) : "";

export interface MargenArmado {
  venta: ResultadoVenta;
  /** null = no hay compra que calce ni elegida: hay que elegirla o escribirla. */
  compra: ResultadoCompra | null;
  /** La que calzó sola (para rotular la opción «la que calza»). */
  calza: { origen: "lote" | "guia"; cubs: ComercialParaMargen[] } | null;
  candidatas: ComercialParaMargen[];
  margen: MargenDelCamion | null;
}

export function armarMargen(input: {
  guardada: GuardadaParaMargen;
  deLaRef: readonly ComercialParaMargen[];
  deLaComunidad: readonly ComercialParaMargen[];
  comunidadParteId?: string;
  eleccion: EleccionDeCompra;
  precioAMano: string;
  rendimiento: RendimientoParaConvertir;
}): MargenArmado {
  const { guardada, deLaRef, deLaComunidad, comunidadParteId, eleccion, precioAMano, rendimiento } = input;
  const venta = ventaDelCamion(guardada, deLaRef);
  const calza = comprasQueCalzan(guardada, deLaRef, deLaComunidad, comunidadParteId);
  /* Las de la comunidad más las del lote (sin repetir), para poder elegir cualquiera. */
  const vistas = new Map([...deLaRef.filter((c) => c.cubicacionRefId === guardada.id), ...deLaComunidad].map((c) => [c.id, c]));
  const candidatas = comprasParaElegir([...vistas.values()], undefined).filter(
    (c) => !comunidadParteId || c.parteId === comunidadParteId || c.cubicacionRefId === guardada.id,
  );

  let compra: ResultadoCompra | null;
  if (eleccion === "mano") {
    const n = precioEscrito(precioAMano);
    compra = n === null
      ? { ok: false, falta: "Escribe el precio de compra por PT (por ejemplo 1,80)." }
      : { ok: true, compra: { origen: "a-mano", porPt: n, cubs: [], monto: null, volumen: null, unidad: null, conversion: { tipo: "directa" } } };
  } else if (eleccion) {
    const elegida = candidatas.find((c) => c.id === eleccion);
    compra = elegida ? compraDesdeCuentas([elegida], "elegida", rendimiento) : calza ? compraDesdeCuentas(calza.cubs, calza.origen, rendimiento) : null;
  } else {
    compra = calza ? compraDesdeCuentas(calza.cubs, calza.origen, rendimiento) : null;
  }

  const margen = venta.ok && compra?.ok ? margenDelCamion(venta.venta, compra.compra) : null;
  return { venta, compra, calza, candidatas, margen };
}

/**
 * Con qué compra arranca el margen de una guardada, sin que el usuario haya
 * elegido nada. La misma regla en el detalle y en el mes:
 * - el lote YA tiene su compra registrada → manda ésa (es lo que se pagó) y el
 *   precio anotado a mano queda de respaldo (revisión 24-10: 2.000 a mano
 *   tapaban 3.600 reales);
 * - esa compra no se puede usar (troza sin rendimiento de la guía) → el anotado;
 * - sin compra del lote → el anotado manda («la próxima vez sale solo») sobre
 *   la que calza por la GTF; sin anotado, la que calza.
 * `respaldo` = hay precio a mano pero no se usó.
 */
export function armarMargenGuardado(
  input: Omit<Parameters<typeof armarMargen>[0], "eleccion">,
): MargenArmado & { eleccion: EleccionDeCompra; respaldo: boolean } {
  const conPrecio = precioEscrito(input.precioAMano) !== null;
  const eleccion: EleccionDeCompra = conPrecio && !hayCompraDelLote(input.guardada.id, input.deLaRef) ? "mano" : "";
  const r = armarMargen({ ...input, eleccion });
  if (conPrecio && eleccion === "" && !r.compra?.ok) return { ...armarMargen({ ...input, eleccion: "mano" }), eleccion: "mano", respaldo: false };
  return { ...r, eleccion, respaldo: conPrecio && eleccion === "" };
}
