/**
 * lib/finance/resultado-del-negocio.ts — Resultado y caja del aserradero (ADR-451).
 *
 * PURO y client-safe: recibe las filas ya traídas (`lib/db/resultado-negocio.db.ts`)
 * y decide qué mes es cada una, qué suma y qué no. La pantalla, el detalle y los
 * tests leen de acá; nadie recalcula.
 *
 * Dos preguntas distintas, dos respuestas:
 *
 *   RESULTADO (lo ganado en el mes, devengado)
 *     + mostrador + pedidos + aserrío que cobraste + madera vendida + fletes cobrados
 *     − mercadería vendida − costo de la madera VENDIDA − aserrío que te hicieron
 *     − fletes pagados − gastos − planilla (≈)
 *     La COMPRA de madera no resta: es madera en el patio y resta cuando se vende
 *     (va al `memo`). Restar las compras Y el costo de lo vendido contaba la misma
 *     madera dos veces; restar sólo las compras ponía en pérdida al mes del camión.
 *
 *   CAJA (lo que entró y salió de verdad)
 *     Cada peso una vez: la liquidación entra por su `pagoMonto`, no por sus
 *     movimientos; el cruce contra lo recibido (ADR-449) nunca es caja; el egreso
 *     de caja de un adelanto dado no se suma aparte del adelanto; los retiros e
 *     ingresos manuales de caja se muestran y NO se suman (suelen ser la otra cara
 *     de un gasto o de un adelanto).
 *
 * Reglas que valen para las dos:
 *  - Mes = calendario de Lima (`mesDeFecha`). Una fecha guardada a las 00:00:00.000
 *    UTC es un DÍA de calendario (cargos de aserrío, gastos, liquidaciones): se lee
 *    tal cual. Cualquier otra hora es un instante y se pasa a Lima.
 *  - Sólo se suma en soles; lo demás va a `otrasMonedas`.
 *  - Un monto que no se sabe es `null` («—»), nunca 0.
 *  - Lo estimado se rotula (`certeza: "estimado"`): si un renglón lo es, el total
 *    también.
 *  - INVARIANTE: `Renglon.monto === Σ filas.monto` — las MISMAS filas que devuelve
 *    el detalle. Si no cierra, la pantalla se contradice sola.
 */

import { formatCurrency } from "@/lib/currency";
import { INGRESO_ORDER_STATUSES } from "@/lib/finance/finance-kpis";
import type { FilaPnl } from "@/lib/forestal/ctp-pnl";
import { claveNumeroGtf, puedeSerLaMismaGtf } from "@/lib/forestal/gtf-talonario";
import { limaDateKey } from "@/lib/utils";
import { decodeExpenseDescription } from "@/lib/expense-meta";

/**
 * El nombre del gasto, sin el bloque `\n---META---\n{json}` que los gastos
 * viejos llevan pegado (ADR-374, `lib/expense-meta.ts`): en main 2 gastos
 * pagados mostraban el JSON de la plantilla en el resultado y en la caja.
 */
function queDelGasto(g: { description?: string | null; category: string }): string {
  return decodeExpenseDescription(g.description ?? "").description.trim() || g.category;
}

// ═══════════════════════════════════════════════════════════════════════════
// Contrato (lo consumen las rutas y la pantalla)
// ═══════════════════════════════════════════════════════════════════════════

export type Certeza = "medido" | "estimado" | "incompleto";

/** Lo que suma al resultado, en el orden en que se muestra. */
export const FUENTES_INGRESO = ["mostrador", "pedidos", "aserrio", "madera_vendida", "fletes_cobrados"] as const;
/** Lo que resta, en el orden en que se muestra. */
export const FUENTES_COSTO = [
  "mercaderia",
  "costo_madera",
  "aserrio_recibido",
  "fletes_pagados",
  "gastos",
  "planilla",
] as const;
export type FuenteIngreso = (typeof FUENTES_INGRESO)[number];
export type FuenteCosto = (typeof FUENTES_COSTO)[number];
export type FuenteResultado = FuenteIngreso | FuenteCosto;

/** Lo que entró a la caja. */
export const FUENTES_ENTRO = [
  "mostrador_cobrado",
  "pedidos_cobrados",
  "cobros_forestales",
  "liquidacion_recibida",
  "adelanto_recibido",
  /** Te devolvieron EN PLATA parte de un adelanto que diste (entrega con movimiento de caja). */
  "adelanto_devuelto",
] as const;
/** Lo que salió de la caja. */
export const FUENTES_SALIO = [
  "adelanto_dado",
  "pagos_forestales",
  "liquidacion_pagada",
  "gastos_pagados",
  "fletes_pagados_caja",
  /** Devolviste EN PLATA parte de lo que te adelantaron (entrega con movimiento de caja). */
  "recibido_devuelto",
] as const;
export type FuenteEntro = (typeof FUENTES_ENTRO)[number];
export type FuenteSalio = (typeof FUENTES_SALIO)[number];
export type FuenteCaja = FuenteEntro | FuenteSalio;

/**
 * Todo lo que se puede abrir en el detalle: los renglones del resultado y de la
 * caja, más la compra de madera (memo, no resta) y los movimientos manuales de
 * caja (se muestran, no se suman).
 */
export const FUENTES_DETALLE = [
  ...FUENTES_INGRESO,
  ...FUENTES_COSTO,
  ...FUENTES_ENTRO,
  ...FUENTES_SALIO,
  "compras_madera",
  "caja_sin_sumar",
] as const;
export type FuenteDetalle = (typeof FUENTES_DETALLE)[number];

/** A dónde lleva el clic en una fila: `?tab=<tab>&<params>` del panel. */
export interface EnlaceOrigen {
  tab: string;
  params: Record<string, string>;
}

/** Una fila del detalle: el hecho que suma, con su fecha y su origen. */
export interface FilaFuente {
  id: string;
  /** `YYYY-MM-DD` del día de Lima en que cuenta (el mismo con el que se decidió el mes). */
  fecha: string;
  /** Quién: cliente, parte, proveedor, persona. `null` = no se sabe. */
  quien: string | null;
  /** Qué: «Corrida N° 63», «Guía 19-001/7 000065», «Venta del mostrador». */
  que: string;
  /** En soles, con su signo dentro del renglón (una corrección resta). */
  monto: number;
  /** Pies tablares medidos. `null` = no hay PT medido (no se inventa). */
  pt: number | null;
  m3: number | null;
  certeza: Certeza;
  enlace: EnlaceOrigen;
}

/** Un renglón del resultado. `signo` dice si suma (1) o resta (-1). */
export interface Renglon {
  fuente: FuenteResultado;
  signo: 1 | -1;
  /** Σ de sus filas, en soles. `null` = no se puede saber (se muestra «—», nunca 0). */
  monto: number | null;
  certeza: Certeza;
  /** Cuántas filas. 0 con monto 0 = «sin movimiento» (la pantalla lo pliega). */
  cuantos: number;
  /** Σ PT de las filas que lo tienen; `null` si ninguna lo tiene. */
  pt: number | null;
  m3: number | null;
  /** Lo que no entró a la suma por falta de un dato (costo, precio, planilla). */
  faltan: { cuantos: number; motivo: string } | null;
  /** Una frase: de dónde sale el número (para el ⓘ). */
  nota: string;
}

export type AvisoCodigo =
  | "fecha_futura"
  | "mes_cerrado_puede_moverse"
  | "costo_estimado"
  | "madera_sin_costo"
  | "venta_sin_despacho"
  | "personal_con_planilla"
  | "planilla_sin_datos"
  | "otras_monedas"
  | "caja_manual_sin_sumar"
  | "recibido_para_cruzar";

export interface Aviso {
  codigo: AvisoCodigo;
  texto: string;
  /** El renglón al que se refiere, si se refiere a uno. */
  fuente: FuenteDetalle | null;
  cuantos: number;
}

export interface OtraMoneda {
  moneda: string;
  cuantos: number;
  total: number;
}

export interface ResultadoDelMes {
  /** `YYYY-MM`, calendario de Lima. */
  mes: string;
  /** El mes está cerrado en el Libro CTP: igual puede moverse (el cobro de aserrío se edita después del cierre). */
  cerradoCtp: boolean;
  ingresos: Renglon[];
  costos: Renglon[];
  /** Σ ingresos con monto conocido. */
  totalIngresos: number;
  /** Σ costos con monto conocido. */
  totalCostos: number;
  /** totalIngresos − totalCostos. */
  resultado: number;
  /** Algún renglón es ≈ (o le falta un dato): el total también. */
  estimado: boolean;
  /**
   * «Compraste S/ X de madera: resta al venderse.» `cuantas` = guías con costo;
   * `sinCosto` = guías compradas del mes que todavía no tienen costo. `compras`
   * es `null` cuando hubo compras y ninguna tiene costo (no se sabe, no es 0).
   */
  memo: { compras: number | null; cuantas: number; sinCosto: number };
  avisos: Aviso[];
  otrasMonedas: OtraMoneda[];
}

/** Un mes de la serie (la tira de meses): sólo los totales. */
export interface PuntoSerie {
  mes: string;
  ingresos: number;
  costos: number;
  resultado: number;
  estimado: boolean;
  cerradoCtp: boolean;
}

/** `GET /api/finanzas/resultado?mes=YYYY-MM&meses=1..12` */
export interface RespuestaResultado {
  actual: ResultadoDelMes;
  /** Del mes más viejo al pedido (incluido); `meses` puntos. */
  serie: PuntoSerie[];
  /** ISO. */
  generadoEn: string;
}

/** `GET /api/finanzas/resultado/detalle?mes=YYYY-MM&fuente=<FuenteDetalle>` */
export interface RespuestaDetalle {
  mes: string;
  fuente: FuenteDetalle;
  /** Ordenadas por fecha, la más nueva arriba. */
  filas: FilaFuente[];
  /** Σ filas.monto (el mismo número del renglón). `null` si el renglón es `null`. */
  total: number | null;
}

export interface RenglonCaja {
  fuente: FuenteCaja;
  lado: "entro" | "salio";
  /** En soles, siempre ≥ 0 (el lado dice la dirección). */
  monto: number;
  certeza: Certeza;
  cuantos: number;
  nota: string;
}

export interface CajaDelMes {
  mes: string;
  entro: RenglonCaja[];
  salio: RenglonCaja[];
  totalEntro: number;
  totalSalio: number;
  /** totalEntro − totalSalio. */
  neto: number;
  estimado: boolean;
  /** Retiros e ingresos manuales de caja: se muestran, no se suman. */
  sinSumar: { cuantos: number; ingresos: number; egresos: number; nota: string };
  /** Cruces, compensaciones y entregas en especie: nunca fueron caja. */
  nuncaCaja: { cuantos: number; monto: number; nota: string };
  avisos: Aviso[];
  otrasMonedas: OtraMoneda[];
}

export type TipoViene =
  | "te_deben_cuenta"
  | "le_debes_cuenta"
  | "recibido_para_cruzar"
  | "adelantos_por_cobrar"
  | "fiados"
  | "por_pagar_proveedores"
  | "planilla_por_pagar";

export interface QuienViene {
  nombre: string;
  monto: number;
  /** `YYYY-MM-DD` pactado; `null` = sin plazo. */
  vence: string | null;
}

export interface ItemViene {
  tipo: TipoViene;
  /** `entra` = te lo deben; `sale` = lo debes; `cruzar` = ya te lo adelantaron, se cruza en Liquidar. */
  lado: "entra" | "sale" | "cruzar";
  /** `null` = no se puede saber (planilla sin datos): «—». */
  monto: number | null;
  certeza: Certeza;
  cuantos: number;
  /** Los que más pesan primero (hasta 8). */
  quienes: QuienViene[];
  nota: string;
  enlace: EnlaceOrigen;
}

export interface LoQueViene {
  items: ItemViene[];
  /** Σ de lo que entra (sin lo `null`). */
  porCobrar: number;
  /** Σ de lo que sale (sin lo `null`). */
  porPagar: number;
  /** Σ de lo que se cruza (no es caja). */
  paraCruzar: number;
  estimado: boolean;
  /** Saldos de la cuenta forestal y adelantos que no están en soles: no se suman. */
  otrasMonedas: OtraMoneda[];
}

/** `GET /api/finanzas/caja-del-negocio?mes=YYYY-MM` */
export interface RespuestaCaja {
  caja: CajaDelMes;
  viene: LoQueViene;
  generadoEn: string;
}

/**
 * ¿`YYYY-MM` es un mes que el negocio puede tener? `parsearMes` deja pasar
 * «0050-01», y lo ganado de RRHH arma un casillero por día desde ahí (693 000
 * días por persona). El negocio no tiene nada antes del 2000 ni después del 2100.
 */
export function esMesDelNegocio(s: string | null | undefined): boolean {
  if (!s || !/^(\d{4})-(0[1-9]|1[0-2])$/.test(s)) return false;
  const anio = Number(s.slice(0, 4));
  return anio >= 2000 && anio <= 2100;
}

/** Claves con las que la pantalla abre Liquidar por la URL (`liquidar-por-url.ts`). */
export const PARAM_ACCION_LIQUIDAR = "accion";
export const ACCION_LIQUIDAR = "liquidar";
export const PARAM_PERSONA_LIQUIDAR = "persona";

/** Prefijo de caché: lo invalidan los writes de aserrío, cuenta forestal y gastos. */
export const PREFIJO_CACHE_RESULTADO = "finanzas:resultado";
export const claveCacheResultado = (tenantId: string) => `${PREFIJO_CACHE_RESULTADO}:${tenantId}`;

// ═══════════════════════════════════════════════════════════════════════════
// Fechas: en qué día (y mes) de Lima cuenta cada cosa
// ═══════════════════════════════════════════════════════════════════════════

type FechaEntrada = Date | string | number | null | undefined;

const SOLO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * El día de Lima en que cuenta una fecha guardada, como `YYYY-MM-DD`.
 *
 * Una fecha a las 00:00:00.000 UTC exactas es un DÍA de calendario, no un
 * instante: el formulario manda «2026-10-01» y la base lo guarda a medianoche
 * UTC. Pasada a Lima sería el 30/09 a las 19:00 y el cargo caería en el mes
 * anterior (los 32 cargos de aserrío de Blas están guardados así). Un texto
 * «YYYY-MM-DD» también es un día. Cualquier otra hora es un instante de Lima.
 * `""` si la fecha no sirve.
 */
export function diaDeFecha(v: FechaEntrada): string {
  if (v == null || v === "") return "";
  if (typeof v === "string" && SOLO_FECHA.test(v)) return v;
  const d = v instanceof Date ? v : new Date(v);
  if (!Number.isFinite(d.getTime())) return "";
  const medianocheUtc =
    d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0;
  return medianocheUtc ? d.toISOString().slice(0, 10) : limaDateKey(d);
}

/** El mes de Lima (`YYYY-MM`) de una fecha guardada: `mesDeGasto` generalizado. `""` si no sirve. */
export function mesDeFecha(v: FechaEntrada): string {
  return diaDeFecha(v).slice(0, 7);
}

/**
 * El día de Lima de un INSTANTE (ventas, pedidos, movimientos de caja): siempre
 * se pasa a Lima, aunque caiga justo a medianoche UTC (las 19:00 de Pucallpa).
 */
function diaLima(v: FechaEntrada): string {
  if (v == null || v === "") return "";
  return limaDateKey(v instanceof Date ? v : new Date(v));
}

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre",
];

/** «setiembre» de `2026-09`. */
export function nombreDelMes(mes: string): string {
  return MESES[Number(mes.slice(5, 7)) - 1] ?? mes;
}

/** «02/10» de `2026-10-02`. */
const ddmm = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

// ═══════════════════════════════════════════════════════════════════════════
// Plata: redondeo, monedas
// ═══════════════════════════════════════════════════════════════════════════

/** Céntimos: la unidad del negocio, no el épsilon del float. */
const r2 = (n: number) => Math.round((n + Math.sign(n) * Number.EPSILON) * 100) / 100 || 0;

const num = (v: unknown): number => {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
};

const esSoles = (moneda: string | null | undefined) => (moneda?.trim() || "PEN").toUpperCase() === "PEN";

/** Lo que no está en soles no se suma: se junta por moneda y se dice. */
function acumuladorMonedas() {
  const m = new Map<string, OtraMoneda>();
  return {
    sumar(moneda: string | null | undefined, monto: number) {
      const k = (moneda?.trim() || "PEN").toUpperCase();
      const prev = m.get(k) ?? { moneda: k, cuantos: 0, total: 0 };
      prev.cuantos += 1;
      prev.total = r2(prev.total + monto);
      m.set(k, prev);
    },
    lista(): OtraMoneda[] {
      return [...m.values()].sort((a, b) => a.moneda.localeCompare(b.moneda));
    },
  };
}

/**
 * Sin costo registrado, la mercadería vendida se estima al 55 % de la venta
 * (el mismo supuesto que ya usaba Ganancias). Se rotula «≈»: en Blas las 4
 * ventas con costo dan 70 %, no 55 %, así que nunca se presenta como el dato.
 */
export const COSTO_ESTIMADO_PCT = 0.55;

// ═══════════════════════════════════════════════════════════════════════════
// Entradas: lo que trae la clase de lectura (ya filtrado por tenant)
// ═══════════════════════════════════════════════════════════════════════════

type Fecha = Date | string;

export interface VentaEntrada {
  id: string;
  createdAt: Fecha;
  total: number;
  /** `null` = la venta no guardó su costo. */
  totalCogs: number | null;
  /** `fiado` no es plata que entró a la caja. */
  payment: string | null;
}

export interface PedidoEntrada {
  id: string;
  createdAt: Fecha;
  deliveredAt: Fecha | null;
  total: number;
  totalCogs: number | null;
  status: string;
  /** `true` = se entregó a cuenta. */
  deuda: boolean | null;
  cliente: string | null;
}

/** Un movimiento vivo de la cuenta corriente forestal. */
export interface MovCuentaEntrada {
  id: string;
  parteId: string;
  parteNombre: string;
  fecha: Fecha;
  /** `cargo` = la parte le debe al CTP; `abono` = el CTP le debe (o la parte pagó). */
  tipo: string;
  concepto: string;
  monto: number;
  moneda: string | null;
  referencia: string | null;
  ctpEntryId: string | null;
  liquidacionId: string | null;
  gtfNumber: string | null;
  /** Sólo hace falta en el flujo: reconoce el cruce que puso una cubicación (`esCruceDeCubicacion`). */
  notas?: string | null;
}

/**
 * El cruce que deja una cubicación aplicada en la cuenta (ADR-484, `patasDeCuenta`:
 * «Cruce con ADL-… · CUB-2026-0003»): es la MISMA plata que la entrega de madera
 * del adelanto, que ya cuenta como «nunca fue caja». Contar los dos la duplica.
 */
export const esCruceDeCubicacion = (m: Pick<MovCuentaEntrada, "concepto" | "notas">): boolean =>
  m.concepto === "compensacion" && /^Cruce con .*·\s*CUB-\d{4}-\d+/.test(m.notas ?? "");

/** La corrida de un cargo de aserrío: de dónde sale el PT. */
export interface CorridaEntrada {
  id: string;
  lineNo: number | null;
  especie: string | null;
  /** PT de la cotización (`aserrioDetalle.pt`). `null` = no hay PT medido. */
  pt: number | null;
  m3: number | null;
  /** `false` = anulada, borrada o que no es un registro vivo: su cargo no suma. */
  viva: boolean;
}

/** Un despacho decidido por `pnlDelPeriodo` (venta, COGS y motivo), con su fecha. */
export type DespachoEntrada = Omit<FilaPnl, "fecha"> & { fecha: string };

export interface FleteEntrada {
  id: string;
  fecha: Fecha;
  tipoTransporte: string | null;
  pagaQuien: string | null;
  monto: number | null;
  moneda: string | null;
  estadoPago: string | null;
  fechaPago: Fecha | null;
  gtfNumber: string | null;
  quien: string | null;
  m3: number | null;
  pt: number | null;
}

export interface GastoEntrada {
  id: string;
  date: Fecha;
  paidAt: Fecha | null;
  amount: number;
  category: string;
  description: string;
  supplierName: string | null;
  /**
   * La guía de un gasto de guía (estiba, descarga…, ADR-437). Ese gasto se anota
   * antes de pagarse: sin `paidAt` es devengado, todavía no plata que salió.
   */
  gtfNumber?: string | null;
}

/** Lo ganado de referencia de RRHH en un mes (`GanadoDB.periodo`). */
export interface PlanillaEntrada {
  total: number;
  personas: { id: string; nombre: string; total: number; diasSinMarcar: number }[];
}

/** Un asiento de ingreso comprado (no de servicio). `costoTotal` null = sin costo todavía. */
export interface CompraMaderaEntrada {
  id: string;
  gtfNumber: string;
  entryDate: Fecha;
  costoTotal: number | null;
  moneda: string | null;
  proveedor: string | null;
  m3: number | null;
}

export interface EntradaResultado {
  /** `YYYY-MM-DD` de Lima: lo fechado después es «fecha futura». */
  hoy: string;
  ventas: VentaEntrada[];
  pedidos: PedidoEntrada[];
  /** Cargos de aserrío (prestado y recibido) y ventas anotadas en la cuenta. */
  cuenta: MovCuentaEntrada[];
  corridas: CorridaEntrada[];
  despachos: DespachoEntrada[];
  fletes: FleteEntrada[];
  /** Sólo gastos ejecutados (sin plantillas `recurring`). */
  gastos: GastoEntrada[];
  /** Por mes `YYYY-MM`. `null` = había personal pero no se pudo calcular. */
  planillas: Record<string, PlanillaEntrada | null>;
  /**
   * `true` = quien pide no ve lo ganado de RRHH (`RRHH_COMPLETO`): la planilla va
   * sin monto («—») y ni siquiera se calcula. Ausente = la ve.
   */
  planillaOculta?: boolean;
  compras: CompraMaderaEntrada[];
  /** Meses cerrados (y no reabiertos) en el Libro CTP. */
  mesesCerrados: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// Fletes y madera vendida
// ═══════════════════════════════════════════════════════════════════════════

export type ClaseDeFlete = "pagado" | "cobrado" | "de_otro" | "sin_monto";

/**
 * Qué es un flete para el resultado:
 * - `pagado`: lo paga el CTP (misma regla que el historial de gastos) → resta.
 * - `cobrado`: viajó en vehículo propio (`privado`) y lo paga otro → suma.
 * - `de_otro`: transportista de tercero pagado por el proveedor o el destinatario → ni suma ni resta.
 * - `sin_monto`: todavía no se sabe cuánto (nunca 0, que fingiría gratis).
 */
export function claseDeFlete(f: { pagaQuien: string | null; tipoTransporte: string | null; monto: number | null }): ClaseDeFlete {
  if (f.monto == null || !Number.isFinite(f.monto)) return "sin_monto";
  if ((f.pagaQuien?.trim() || "ctp") === "ctp") return "pagado";
  if ((f.tipoTransporte?.trim() || "privado") === "privado") return "cobrado";
  return "de_otro";
}

/** Una venta de madera: todo lo de UNA guía de salida junto. */
export interface GrupoVentaMadera {
  clave: string;
  gtf: string | null;
  /** `YYYY-MM-DD` de Lima en que cuenta: la de la cuenta si la venta está ahí; si no, el primer despacho. */
  fecha: string;
  quien: string | null;
  /** `null` = los despachos no tienen precio (y no está en la cuenta). */
  venta: number | null;
  origenVenta: "cuenta" | "despacho" | null;
  /** Despachos propios del grupo sin precio de venta. */
  sinPrecio: number;
  /** Costo de la madera de este despacho. `null` = falta (factura, atribución, mezcla con servicio). */
  costo: number | null;
  motivoCosto: "ok" | "sin_costo" | "sin_despacho" | "de_servicio";
  /** Todo el grupo es madera ajena aserrada por servicio: no es una venta ni un faltante. */
  deServicio: boolean;
  lineNos: number[];
  moneda: string;
}

const normGtf = (s: string | null | undefined) => (s ?? "").trim().replace(/\s+/g, " ").toUpperCase();

/**
 * La llave de grupo de cada guía escrita: por su N° (`claveNumeroGtf`:
 * «019-002-0000009» ≡ «19-2-9»), y un N° escrito corto («065») se suma al
 * ÚNICO número completo de la lista que termina igual (`puedeSerLaMismaGtf`,
 * la regla de los frenos). Si calza con dos series distintas no se adivina:
 * queda solo. Dos series completas nunca se juntan.
 */
function llavesDeGuia(textos: readonly string[]): Map<string, string> {
  const llaveDe = new Map(textos.map((t) => [t, claveNumeroGtf(t) ?? t]));
  const llaves = [...new Set(llaveDe.values())];
  const tramos = (k: string) => k.split("-").length;
  const grupoDe = new Map<string, string>();
  for (const k of llaves) {
    const mayores = llaves.filter((o) => tramos(o) > tramos(k) && puedeSerLaMismaGtf(o, k));
    const completas = mayores.filter((o) => !mayores.some((p) => tramos(p) > tramos(o) && puedeSerLaMismaGtf(p, o)));
    grupoDe.set(k, completas.length === 1 ? completas[0] : k);
  }
  return new Map(textos.map((t) => [t, grupoDe.get(llaveDe.get(t) ?? t) ?? t]));
}

/**
 * Junta la madera vendida por guía de salida. La misma guía puede estar en el
 * despacho (`valorVenta`) y en la cuenta del cliente (cargo `venta`, ADR-437):
 * se cuenta UNA vez y, si están las dos, manda la cuenta (es lo que se le cobra).
 * Se junta por el N° de la guía, no por el texto (`llavesDeGuia`): «19-2-9» en
 * el despacho y «019-002-0000009» en la cuenta son la misma venta.
 */
export function ventasDeMadera(despachos: readonly DespachoEntrada[], cuenta: readonly MovCuentaEntrada[]): GrupoVentaMadera[] {
  const grupos = new Map<string, { gtf: string | null; ds: DespachoEntrada[]; cs: MovCuentaEntrada[] }>();
  const grupo = (clave: string, gtf: string | null) => {
    const g = grupos.get(clave) ?? { gtf, ds: [], cs: [] };
    grupos.set(clave, g);
    return g;
  };
  const cargos = cuenta.filter((c) => c.concepto === "venta" && c.tipo === "cargo");
  const textoDe = (c: MovCuentaEntrada) => normGtf(c.referencia) || normGtf(c.gtfNumber);
  const llave = llavesDeGuia([...cargos.map(textoDe), ...despachos.map((d) => normGtf(d.gtfSalida))].filter(Boolean));
  for (const c of cargos) {
    const gtf = textoDe(c);
    grupo(gtf ? `gtf:${llave.get(gtf) ?? gtf}` : `cuenta:${c.id}`, gtf || null).cs.push(c);
  }
  for (const d of despachos) {
    const gtf = normGtf(d.gtfSalida);
    grupo(gtf ? `gtf:${llave.get(gtf) ?? gtf}` : `despacho:${d.id}`, gtf || null).ds.push(d);
  }

  const out: GrupoVentaMadera[] = [];
  for (const [clave, { gtf, ds, cs }] of grupos) {
    const propios = ds.filter((d) => d.motivo !== "madera_de_servicio");
    const deServicio = cs.length === 0 && ds.length > 0 && propios.length === 0;
    const conPrecio = propios.filter((d) => d.valorVenta != null);
    const venta = cs.length > 0 ? r2(cs.reduce((a, c) => a + num(c.monto), 0)) : conPrecio.length > 0 ? r2(conPrecio.reduce((a, d) => a + num(d.valorVenta), 0)) : null;
    let costo: number | null;
    let motivoCosto: GrupoVentaMadera["motivoCosto"];
    if (ds.length === 0) {
      costo = null;
      motivoCosto = "sin_despacho";
    } else if (propios.length === 0) {
      costo = 0;
      motivoCosto = "de_servicio";
    } else if (propios.some((d) => d.cogs == null)) {
      costo = null;
      motivoCosto = "sin_costo";
    } else {
      costo = r2(propios.reduce((a, d) => a + num(d.cogs), 0));
      motivoCosto = "ok";
    }
    // Un costo en otra moneda no se resta a soles: queda como faltante.
    if (costo != null && propios.some((d) => d.cogs != null && !esSoles(d.moneda))) {
      costo = null;
      motivoCosto = "sin_costo";
    }
    const dias = (cs.length > 0 ? cs.map((c) => diaDeFecha(c.fecha)) : ds.map((d) => diaDeFecha(d.fecha))).filter(Boolean).sort();
    out.push({
      clave,
      gtf,
      fecha: dias[0] ?? "",
      quien: cs[0]?.parteNombre?.trim() || null,
      venta,
      origenVenta: cs.length > 0 ? "cuenta" : venta != null ? "despacho" : null,
      sinPrecio: cs.length > 0 ? 0 : propios.length - conPrecio.length,
      costo,
      motivoCosto,
      deServicio,
      lineNos: ds.map((d) => d.lineNo).sort((a, b) => a - b),
      // La moneda de la VENTA (la de la cuenta o la del despacho), no la del costo.
      moneda: ((cs[0]?.moneda ?? ds[0]?.monedaVenta ?? ds[0]?.moneda)?.trim() || "PEN").toUpperCase(),
    });
  }
  return out.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.clave.localeCompare(b.clave));
}

// ═══════════════════════════════════════════════════════════════════════════
// Resultado
// ═══════════════════════════════════════════════════════════════════════════

const ENLACE_LIBRO = "ctp-libro-operaciones";

type ClaveResultado = FuenteResultado | "compras_madera";

interface CalculoResultado {
  filas: Record<ClaveResultado, FilaFuente[]>;
  faltan: Partial<Record<FuenteResultado, { cuantos: number; motivo: string }>>;
  /** Renglones que no se pueden saber: monto `null`. */
  nulos: Set<FuenteResultado>;
  avisos: Aviso[];
  otrasMonedas: OtraMoneda[];
  comprasSinCosto: number;
  /** La nota de un renglón cuando no es la de siempre (planilla sin permiso). */
  notas: Partial<Record<FuenteResultado, string>>;
}

/** Lo que dice un renglón o un pendiente de RRHH a quien no ve lo ganado. */
export const NOTA_PLANILLA_SIN_PERMISO = "No tienes acceso a la planilla.";

const vacias = (): Record<ClaveResultado, FilaFuente[]> => ({
  mostrador: [], pedidos: [], aserrio: [], madera_vendida: [], fletes_cobrados: [],
  mercaderia: [], costo_madera: [], aserrio_recibido: [], fletes_pagados: [], gastos: [], planilla: [],
  compras_madera: [],
});

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Las filas de cada renglón del mes. El renglón es SU suma: nadie más suma. */
function calcularResultado(mes: string, e: EntradaResultado): CalculoResultado {
  const filas = vacias();
  const faltan: CalculoResultado["faltan"] = {};
  const nulos = new Set<FuenteResultado>();
  const avisos: Aviso[] = [];
  const monedas = acumuladorMonedas();

  // ── Mostrador y su mercadería, por día de Lima ─────────────────────────
  const porDia = new Map<string, { n: number; total: number; cogs: number; nEst: number; totalEst: number }>();
  for (const v of e.ventas) {
    const dia = diaLima(v.createdAt);
    if (dia.slice(0, 7) !== mes) continue;
    const d = porDia.get(dia) ?? { n: 0, total: 0, cogs: 0, nEst: 0, totalEst: 0 };
    d.n += 1;
    d.total += num(v.total);
    if (v.totalCogs != null && Number.isFinite(v.totalCogs)) d.cogs += num(v.totalCogs);
    else {
      d.nEst += 1;
      d.totalEst += num(v.total);
    }
    porDia.set(dia, d);
  }
  let sinCostoMercaderia = 0;
  for (const [dia, d] of [...porDia.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const enlace = { tab: "ventas-caja", params: { dia } };
    filas.mostrador.push({
      id: `mostrador:${dia}`, fecha: dia, quien: null, que: `${plural(d.n, "venta", "ventas")} del mostrador`,
      monto: r2(d.total), pt: null, m3: null, certeza: "medido", enlace,
    });
    if (d.n - d.nEst > 0) {
      filas.mercaderia.push({
        id: `mercaderia:${dia}`, fecha: dia, quien: null, que: `Costo de ${plural(d.n - d.nEst, "venta", "ventas")} del mostrador`,
        monto: r2(d.cogs), pt: null, m3: null, certeza: "medido", enlace,
      });
    }
    if (d.nEst > 0) {
      sinCostoMercaderia += d.nEst;
      filas.mercaderia.push({
        id: `mercaderia:${dia}:estimado`, fecha: dia, quien: null,
        que: `≈ 55 % de ${plural(d.nEst, "venta", "ventas")} sin costo`,
        monto: r2(d.totalEst * COSTO_ESTIMADO_PCT), pt: null, m3: null, certeza: "estimado", enlace,
      });
    }
  }

  // ── Pedidos concretados y su mercadería ───────────────────────────────
  for (const p of e.pedidos) {
    const dia = diaLima(p.createdAt);
    if (dia.slice(0, 7) !== mes) continue;
    if (!(INGRESO_ORDER_STATUSES as readonly string[]).includes(p.status)) continue;
    const enlace = { tab: "pedidos", params: { pedido: p.id } };
    const que = `Pedido ${p.id.slice(-6).toUpperCase()}`;
    filas.pedidos.push({ id: p.id, fecha: dia, quien: p.cliente?.trim() || null, que, monto: r2(num(p.total)), pt: null, m3: null, certeza: "medido", enlace });
    const conCosto = p.totalCogs != null && Number.isFinite(p.totalCogs);
    if (!conCosto) sinCostoMercaderia += 1;
    filas.mercaderia.push({
      id: `mercaderia:${p.id}`, fecha: dia, quien: p.cliente?.trim() || null,
      que: conCosto ? `Costo del ${que.toLowerCase()}` : `≈ 55 % del ${que.toLowerCase()} sin costo`,
      monto: r2(conCosto ? num(p.totalCogs) : num(p.total) * COSTO_ESTIMADO_PCT),
      pt: null, m3: null, certeza: conCosto ? "medido" : "estimado", enlace,
    });
  }
  if (sinCostoMercaderia > 0) {
    avisos.push({
      codigo: "costo_estimado", fuente: "mercaderia", cuantos: sinCostoMercaderia,
      texto: `${plural(sinCostoMercaderia, "venta no guardó", "ventas no guardaron")} su costo: se estima en 55 % de lo vendido.`,
    });
  }

  // ── Aserrío (el cargo de cada corrida) ────────────────────────────────
  const corridas = new Map(e.corridas.map((c) => [c.id, c]));
  const futuras: FilaFuente[] = [];
  for (const m of e.cuenta) {
    const prestado = m.concepto === "aserrio_prestado";
    if (!prestado && m.concepto !== "aserrio_recibido") continue;
    const corrida = m.ctpEntryId ? corridas.get(m.ctpEntryId) : undefined;
    if (corrida && !corrida.viva) continue;
    const dia = diaDeFecha(m.fecha);
    // Prestado: el cargo suma y un abono lo corrige. Recibido: el abono es lo que debes.
    const signo = prestado ? (m.tipo === "cargo" ? 1 : -1) : m.tipo === "abono" ? 1 : -1;
    const monto = r2(signo * num(m.monto));
    const fila: FilaFuente = {
      id: m.id, fecha: dia, quien: m.parteNombre?.trim() || null,
      que: corrida?.lineNo != null
        ? `Corrida N° ${corrida.lineNo}${corrida.especie ? ` · ${corrida.especie}` : ""}`
        : m.referencia?.trim() || (prestado ? "Aserrío cobrado" : "Aserrío que te hicieron"),
      monto, pt: corrida?.pt ?? null, m3: corrida?.m3 ?? null, certeza: "medido",
      enlace: corrida?.lineNo != null
        ? { tab: ENLACE_LIBRO, params: { seccion: "produccion", linea: String(corrida.lineNo) } }
        : { tab: "plata", params: { vista: "por-cobrar" } },
    };
    if (prestado && dia > e.hoy) futuras.push(fila);
    if (dia.slice(0, 7) !== mes) continue;
    if (!esSoles(m.moneda)) {
      monedas.sumar(m.moneda, monto);
      continue;
    }
    (prestado ? filas.aserrio : filas.aserrio_recibido).push(fila);
  }
  const mesHoy = e.hoy.slice(0, 7);
  const futurasDelAviso = futuras.filter((f) => f.fecha.slice(0, 7) === mes || (mes === mesHoy && f.fecha.slice(0, 7) > mes));
  if (futurasDelAviso.length > 0) {
    const f0 = futurasDelAviso[0];
    avisos.push({
      codigo: "fecha_futura", fuente: "aserrio", cuantos: futurasDelAviso.length,
      texto: futurasDelAviso.length === 1
        ? `${f0.que.split(" · ")[0]} tiene fecha ${ddmm(f0.fecha)}, después de hoy: su cobro de ${formatCurrency(f0.monto)} cuenta en ${nombreDelMes(f0.fecha.slice(0, 7))}.`
        : `${futurasDelAviso.length} cobros de aserrío tienen fecha después de hoy (${formatCurrency(futurasDelAviso.reduce((a, f) => a + f.monto, 0))}): cuentan en el mes de su fecha.`,
    });
  }

  // ── Madera vendida y su costo, por guía ───────────────────────────────
  let sinPrecio = 0;
  let sinCostoMadera = 0;
  let sinDespacho = 0;
  for (const g of ventasDeMadera(e.despachos, e.cuenta)) {
    if (g.deServicio || g.fecha.slice(0, 7) !== mes) continue;
    if (g.venta != null && !esSoles(g.moneda)) {
      monedas.sumar(g.moneda, g.venta);
      continue;
    }
    const que = g.gtf ? `Guía ${g.gtf}` : `Despacho N° ${g.lineNos.join(", ") || "—"}`;
    const enlace = { tab: ENLACE_LIBRO, params: { seccion: "despacho", ...(g.gtf ? { gtf: g.gtf } : {}) } };
    if (g.venta == null) {
      sinPrecio += g.sinPrecio || 1;
      continue;
    }
    sinPrecio += g.sinPrecio;
    filas.madera_vendida.push({ id: `madera:${g.clave}`, fecha: g.fecha, quien: g.quien, que, monto: g.venta, pt: null, m3: null, certeza: g.sinPrecio > 0 ? "incompleto" : "medido", enlace });
    if (g.costo == null) {
      if (g.motivoCosto === "sin_despacho") sinDespacho += 1;
      else sinCostoMadera += 1;
      continue;
    }
    if (g.motivoCosto === "de_servicio") continue;
    filas.costo_madera.push({ id: `costo:${g.clave}`, fecha: g.fecha, quien: g.quien, que: `Costo de la madera · ${que.toLowerCase()}`, monto: g.costo, pt: null, m3: null, certeza: "medido", enlace });
  }
  if (sinPrecio > 0) faltan.madera_vendida = { cuantos: sinPrecio, motivo: `${plural(sinPrecio, "despacho", "despachos")} sin precio de venta` };
  if (sinCostoMadera + sinDespacho > 0) {
    faltan.costo_madera = { cuantos: sinCostoMadera + sinDespacho, motivo: `${plural(sinCostoMadera + sinDespacho, "venta", "ventas")} sin costo de la madera` };
  }
  if (sinCostoMadera > 0) {
    avisos.push({
      codigo: "madera_sin_costo", fuente: "costo_madera", cuantos: sinCostoMadera,
      texto: `${plural(sinCostoMadera, "guía vendida no tiene", "guías vendidas no tienen")} el costo de su madera: el resultado sale más alto de lo real.`,
    });
  }
  if (sinDespacho > 0) {
    avisos.push({
      codigo: "venta_sin_despacho", fuente: "madera_vendida", cuantos: sinDespacho,
      texto: `${plural(sinDespacho, "venta anotada", "ventas anotadas")} en la cuenta del cliente sin despacho en el libro: falta su costo.`,
    });
  }

  // ── Fletes ────────────────────────────────────────────────────────────
  for (const f of e.fletes) {
    const clase = claseDeFlete(f);
    if (clase !== "pagado" && clase !== "cobrado") continue;
    const dia = diaDeFecha(f.fecha);
    if (dia.slice(0, 7) !== mes) continue;
    if (!esSoles(f.moneda)) {
      monedas.sumar(f.moneda, num(f.monto));
      continue;
    }
    (clase === "pagado" ? filas.fletes_pagados : filas.fletes_cobrados).push({
      id: f.id, fecha: dia, quien: f.quien?.trim() || null,
      que: f.gtfNumber?.trim() ? `Flete · guía ${f.gtfNumber.trim()}` : "Flete",
      monto: r2(num(f.monto)), pt: f.pt, m3: f.m3, certeza: "medido",
      enlace: { tab: "forestal-herramientas", params: { vista: "fletes" } },
    });
  }

  // ── Planilla (≈) y gastos ─────────────────────────────────────────────
  const notas: CalculoResultado["notas"] = {};
  const planilla = e.planillaOculta ? undefined : e.planillas[mes];
  const hayPlanilla = planilla != null && planilla.personas.some((p) => p.total > 0);
  if (e.planillaOculta) {
    // Sin permiso: sin monto y sin filas (el detalle tampoco las muestra).
    nulos.add("planilla");
    notas.planilla = NOTA_PLANILLA_SIN_PERMISO;
  } else if (planilla === null) {
    nulos.add("planilla");
    avisos.push({ codigo: "planilla_sin_datos", fuente: "planilla", cuantos: 0, texto: "No se pudo calcular lo ganado del personal este mes." });
  } else if (planilla) {
    let diasSinMarcar = 0;
    for (const p of planilla.personas) {
      diasSinMarcar += p.diasSinMarcar;
      if (!(p.total > 0)) continue;
      filas.planilla.push({
        id: `planilla:${p.id}`, fecha: `${mes}-01`, quien: p.nombre, que: "≈ Lo ganado según su asistencia",
        monto: r2(p.total), pt: null, m3: null, certeza: "estimado", enlace: { tab: "rrhh", params: { colaborador: p.id } },
      });
    }
    if (diasSinMarcar > 0) faltan.planilla = { cuantos: diasSinMarcar, motivo: `${plural(diasSinMarcar, "día", "días")} sin marcar asistencia` };
  }
  let personalExcluido = 0;
  let personalMonto = 0;
  for (const g of e.gastos) {
    const dia = diaDeFecha(g.date);
    if (dia.slice(0, 7) !== mes) continue;
    if (hayPlanilla && g.category === "personal") {
      personalExcluido += 1;
      personalMonto += num(g.amount);
      continue;
    }
    filas.gastos.push({
      id: g.id, fecha: dia, quien: g.supplierName?.trim() || null, que: queDelGasto(g),
      monto: r2(num(g.amount)), pt: null, m3: null, certeza: "medido", enlace: { tab: "plata", params: { vista: "gastos" } },
    });
  }
  if (personalExcluido > 0) {
    avisos.push({
      codigo: "personal_con_planilla", fuente: "gastos", cuantos: personalExcluido,
      texto: `${plural(personalExcluido, "gasto", "gastos")} de personal (${formatCurrency(personalMonto)}) no se restan: la planilla de Recursos Humanos ya cuenta ese trabajo.`,
    });
  }

  // ── Compra de madera: memo, NO resta ──────────────────────────────────
  const porGuia = new Map<string, { fecha: string; monto: number; conCosto: boolean; sinCosto: boolean; proveedor: string | null; m3: number; moneda: string }>();
  for (const c of e.compras) {
    const gtf = normGtf(c.gtfNumber);
    if (!gtf) continue;
    const dia = diaDeFecha(c.entryDate);
    const g = porGuia.get(gtf) ?? { fecha: dia, monto: 0, conCosto: false, sinCosto: false, proveedor: c.proveedor?.trim() || null, m3: 0, moneda: (c.moneda?.trim() || "PEN").toUpperCase() };
    if (dia && dia < g.fecha) g.fecha = dia;
    if (c.costoTotal != null) {
      g.conCosto = true;
      g.monto += num(c.costoTotal);
    } else g.sinCosto = true;
    g.m3 += num(c.m3);
    porGuia.set(gtf, g);
  }
  let comprasSinCosto = 0;
  for (const [gtf, g] of porGuia) {
    if (g.fecha.slice(0, 7) !== mes) continue;
    if (!g.conCosto) {
      comprasSinCosto += 1;
      continue;
    }
    if (!esSoles(g.moneda)) {
      monedas.sumar(g.moneda, r2(g.monto));
      continue;
    }
    filas.compras_madera.push({
      id: `compra:${gtf}`, fecha: g.fecha, quien: g.proveedor, que: `Guía ${gtf}`, monto: r2(g.monto),
      pt: null, m3: g.m3 > 0 ? Math.round(g.m3 * 1000) / 1000 : null, certeza: g.sinCosto ? "incompleto" : "medido",
      enlace: { tab: ENLACE_LIBRO, params: { seccion: "ingresos", gtf } },
    });
  }

  if (e.mesesCerrados.includes(mes)) {
    avisos.push({
      codigo: "mes_cerrado_puede_moverse", fuente: null, cuantos: 0,
      texto: "El mes está cerrado en el Libro CTP, pero el cobro de un aserrío se puede cambiar después del cierre: este resultado todavía puede moverse.",
    });
  }
  const otrasMonedas = monedas.lista();
  if (otrasMonedas.length > 0) {
    avisos.push({
      codigo: "otras_monedas", fuente: null, cuantos: otrasMonedas.reduce((a, m) => a + m.cuantos, 0),
      texto: `Hay montos en ${otrasMonedas.map((m) => m.moneda).join(", ")}: no se suman a los soles.`,
    });
  }

  for (const k of Object.keys(filas) as ClaveResultado[]) filas[k].sort((a, b) => b.fecha.localeCompare(a.fecha) || a.id.localeCompare(b.id));
  return { filas, faltan, nulos, avisos, otrasMonedas, comprasSinCosto, notas };
}

const NOTAS: Record<FuenteResultado, string> = {
  mostrador: "Ventas del punto de venta, por día de Lima.",
  pedidos: "Pedidos confirmados, en camino o entregados.",
  aserrio: "Lo que cobraste por aserrar madera ajena: el cargo de cada corrida.",
  madera_vendida: "Madera despachada con precio. Si la venta está en la cuenta del cliente y en el despacho, se cuenta una vez.",
  fletes_cobrados: "Viajes en tu vehículo que paga otro.",
  mercaderia: "Costo de lo vendido en el mostrador y en pedidos. Sin costo guardado se estima en 55 %.",
  costo_madera: "Lo que te costó la madera que vendiste. La compra no resta: resta cuando se vende.",
  aserrio_recibido: "Lo que te cobraron por aserrarte madera.",
  fletes_pagados: "Fletes que pagas tú.",
  gastos: "Gastos anotados, sin las plantillas de gasto fijo.",
  planilla: "≈ Lo ganado según la asistencia de Recursos Humanos. Es una referencia, no la boleta.",
};

const sumaFilas = (filas: readonly FilaFuente[]) => r2(filas.reduce((a, f) => a + f.monto, 0));

function sumaOpcional(filas: readonly FilaFuente[], campo: "pt" | "m3"): number | null {
  const con = filas.filter((f) => f[campo] != null);
  if (con.length === 0) return null;
  return Math.round(con.reduce((a, f) => a + num(f[campo]), 0) * 100) / 100;
}

function aRenglon(fuente: FuenteResultado, signo: 1 | -1, c: CalculoResultado): Renglon {
  const filas = c.filas[fuente];
  const faltan = c.faltan[fuente] ?? null;
  const nulo = c.nulos.has(fuente);
  const certeza: Certeza = nulo || faltan || filas.some((f) => f.certeza === "incompleto")
    ? "incompleto"
    : filas.some((f) => f.certeza === "estimado")
      ? "estimado"
      : "medido";
  return {
    fuente, signo,
    monto: nulo ? null : sumaFilas(filas),
    certeza, cuantos: filas.length,
    pt: sumaOpcional(filas, "pt"), m3: sumaOpcional(filas, "m3"),
    faltan, nota: c.notas[fuente] ?? NOTAS[fuente],
  };
}

/** El resultado de un mes de Lima, con sus renglones, el memo de compras y los avisos. */
export function armarResultado(mes: string, e: EntradaResultado): ResultadoDelMes {
  const c = calcularResultado(mes, e);
  const ingresos = FUENTES_INGRESO.map((f) => aRenglon(f, 1, c));
  const costos = FUENTES_COSTO.map((f) => aRenglon(f, -1, c));
  const totalIngresos = r2(ingresos.reduce((a, r) => a + (r.monto ?? 0), 0));
  const totalCostos = r2(costos.reduce((a, r) => a + (r.monto ?? 0), 0));
  const compras = c.filas.compras_madera;
  return {
    mes,
    cerradoCtp: e.mesesCerrados.includes(mes),
    ingresos, costos, totalIngresos, totalCostos,
    resultado: r2(totalIngresos - totalCostos),
    estimado: [...ingresos, ...costos].some((r) => r.certeza !== "medido"),
    memo: {
      compras: compras.length === 0 && c.comprasSinCosto > 0 ? null : sumaFilas(compras),
      cuantas: compras.length,
      sinCosto: c.comprasSinCosto,
    },
    avisos: c.avisos,
    otrasMonedas: c.otrasMonedas,
  };
}

/** La tira de meses: el mismo cálculo, sólo los totales. */
export function armarSerie(meses: readonly string[], e: EntradaResultado): PuntoSerie[] {
  return meses.map((mes) => {
    const r = armarResultado(mes, e);
    return { mes, ingresos: r.totalIngresos, costos: r.totalCostos, resultado: r.resultado, estimado: r.estimado, cerradoCtp: r.cerradoCtp };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Caja
// ═══════════════════════════════════════════════════════════════════════════

export interface CuotaFiadoEntrada {
  id: string;
  pagadoEn: Fecha;
  monto: number;
  cliente: string | null;
}

export interface LiquidacionEntrada {
  id: string;
  codigo: string;
  fecha: Fecha;
  /** `recibido` = te pagaron; `hecho` = pagaste. */
  pagoDireccion: string | null;
  pagoMonto: number | null;
  montoCompensado: number;
  personaNombre: string;
  cajaMovimientoId: string | null;
}

export interface AdelantoEntrada {
  id: string;
  codigo: string | null;
  fechaAdelanto: Fecha;
  montoAdelantado: number;
  moneda: string | null;
  direccion: "DADO" | "RECIBIDO";
  beneficiario: string | null;
}

export interface MovCajaEntrada {
  id: string;
  /** Sólo `ingreso` y `egreso` (lo manual); `venta`, `apertura`, `arqueo` ya están en otro lado. */
  type: string;
  amount: number;
  description: string;
  createdAt: Fecha;
}

export interface EntregaEntrada {
  id: string;
  fecha: Fecha;
  valor: number;
  liquidacionId: string | null;
  /** El código del adelanto: con él (y el monto y el tipo) se reconoce su movimiento de caja. */
  adelantoCodigo: string | null;
  direccion: "DADO" | "RECIBIDO";
  beneficiario: string | null;
}

/**
 * Cómo empieza la etiqueta del movimiento de caja de una DEVOLUCIÓN en plata
 * (`lib/adelantos/movimiento-caja.ts`: `etiquetaIngreso` para lo DADO,
 * `etiquetaRecibido("devolucion")` para lo RECIBIDO). Un test fija que no se
 * despeguen. Hasta que la entrega guarde su movimiento (columna futura
 * `AdelantoEntrega.cajaMovimientoId`, ADR-451), se empareja por código + monto + tipo.
 */
export const PREFIJO_DEVOLUCION_DADO = "Liquidación de adelanto ";
export const PREFIJO_DEVOLUCION_RECIBIDO = "Devolución de adelanto recibido ";

export interface EntradaCaja {
  ventas: VentaEntrada[];
  cuotasFiado: CuotaFiadoEntrada[];
  pedidos: PedidoEntrada[];
  /** Movimientos vivos de la cuenta forestal del período (pagos, compensaciones, lo de liquidaciones). */
  cuenta: MovCuentaEntrada[];
  /** Sólo las vivas (sin anular). */
  liquidaciones: LiquidacionEntrada[];
  /** Sin los CANCELADO. */
  adelantos: AdelantoEntrada[];
  /** Códigos de TODOS los adelantos (también cancelados): para reconocer su egreso de caja. */
  codigosAdelanto: string[];
  /**
   * TODAS las liquidaciones (también anuladas), sólo para reconocer su movimiento
   * de caja o su reversión en la lista de lo que no se suma.
   */
  cajaDeLiquidaciones: { codigo: string; cajaMovimientoId: string | null; cajaReversionId: string | null }[];
  gastos: GastoEntrada[];
  fletes: FleteEntrada[];
  movimientosCaja: MovCajaEntrada[];
  /**
   * Entregas vivas de adelantos. La que tiene su movimiento de caja (devolución
   * en plata) es caja; las demás (trabajo, producto) nunca lo fueron.
   */
  entregas: EntregaEntrada[];
}

type ClaveCaja = FuenteCaja | "caja_sin_sumar";

interface CalculoCaja {
  filas: Record<ClaveCaja, FilaFuente[]>;
  nuncaCaja: { cuantos: number; monto: number };
  avisos: Aviso[];
  otrasMonedas: OtraMoneda[];
}

const vaciasCaja = (): Record<ClaveCaja, FilaFuente[]> => ({
  mostrador_cobrado: [], pedidos_cobrados: [], cobros_forestales: [], liquidacion_recibida: [], adelanto_recibido: [],
  adelanto_devuelto: [],
  adelanto_dado: [], pagos_forestales: [], liquidacion_pagada: [], gastos_pagados: [], fletes_pagados_caja: [],
  recibido_devuelto: [],
  caja_sin_sumar: [],
});

const escaparRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function calcularCaja(mes: string, e: EntradaCaja): CalculoCaja {
  const filas = vaciasCaja();
  const monedas = acumuladorMonedas();
  const nunca = { cuantos: 0, monto: 0 };
  const avisos: Aviso[] = [];
  const del = (dia: string) => dia.slice(0, 7) === mes;

  // ── Mostrador: lo que no fue fiado, más lo que se cobró de fiados ─────
  const porDia = new Map<string, { n: number; total: number }>();
  for (const v of e.ventas) {
    if ((v.payment ?? "").trim().toLowerCase() === "fiado") continue;
    const dia = diaLima(v.createdAt);
    if (!del(dia)) continue;
    const d = porDia.get(dia) ?? { n: 0, total: 0 };
    d.n += 1;
    d.total += num(v.total);
    porDia.set(dia, d);
  }
  for (const [dia, d] of porDia) {
    filas.mostrador_cobrado.push({
      id: `cobrado:${dia}`, fecha: dia, quien: null, que: `${plural(d.n, "venta cobrada", "ventas cobradas")} en el mostrador`,
      monto: r2(d.total), pt: null, m3: null, certeza: "medido", enlace: { tab: "ventas-caja", params: { dia } },
    });
  }
  for (const c of e.cuotasFiado) {
    const dia = diaLima(c.pagadoEn);
    if (!del(dia)) continue;
    filas.mostrador_cobrado.push({
      id: `fiado:${c.id}`, fecha: dia, quien: c.cliente?.trim() || null, que: "Cobro de un fiado",
      monto: r2(num(c.monto)), pt: null, m3: null, certeza: "medido", enlace: { tab: "plata", params: { vista: "fiados" } },
    });
  }

  // ── Pedidos entregados y no a cuenta ──────────────────────────────────
  for (const p of e.pedidos) {
    if (p.status !== "entregado" || p.deuda === true) continue;
    const dia = diaLima(p.deliveredAt ?? p.createdAt);
    if (!del(dia)) continue;
    filas.pedidos_cobrados.push({
      id: p.id, fecha: dia, quien: p.cliente?.trim() || null, que: `Pedido ${p.id.slice(-6).toUpperCase()} entregado`,
      monto: r2(num(p.total)), pt: null, m3: null, certeza: "medido", enlace: { tab: "pedidos", params: { pedido: p.id } },
    });
  }

  // ── Cuenta forestal: sólo los pagos sueltos (lo de una liquidación entra por su pago) ─
  for (const m of e.cuenta) {
    const dia = diaDeFecha(m.fecha);
    if (!del(dia)) continue;
    // La pata de una liquidación no suma en ningún lado: su plata (si hubo) es el
    // `pagoMonto` de la cabecera y lo cruzado es su `montoCompensado`, una vez cada uno.
    if (m.liquidacionId) continue;
    if (m.concepto === "compensacion") {
      // El cruce de una cubicación es la entrega de su adelanto, que ya suma abajo (ADR-484).
      if (esCruceDeCubicacion(m)) continue;
      nunca.cuantos += 1;
      nunca.monto = r2(nunca.monto + num(m.monto));
      continue;
    }
    // `pago` = te pagaron; `pago_hecho` = le pagaste (ADR-413). Un cargo es plata que sale.
    if (m.concepto !== "pago" && m.concepto !== "pago_hecho") continue;
    if (!esSoles(m.moneda)) {
      monedas.sumar(m.moneda, num(m.monto));
      continue;
    }
    const entro = m.tipo === "abono";
    (entro ? filas.cobros_forestales : filas.pagos_forestales).push({
      id: m.id, fecha: dia, quien: m.parteNombre?.trim() || null,
      que: m.referencia?.trim() ? `${entro ? "Cobro" : "Pago"} · ${m.referencia.trim()}` : entro ? "Cobro de la cuenta" : "Pago de la cuenta",
      monto: r2(num(m.monto)), pt: null, m3: null, certeza: "medido", enlace: { tab: "plata", params: { vista: "por-cobrar" } },
    });
  }

  // ── Liquidaciones: el pago UNA vez; lo cruzado nunca es caja ──────────
  for (const l of e.liquidaciones) {
    const dia = diaDeFecha(l.fecha);
    if (!del(dia)) continue;
    if (num(l.montoCompensado) > 0) {
      nunca.cuantos += 1;
      nunca.monto = r2(nunca.monto + num(l.montoCompensado));
    }
    if (l.pagoMonto == null || !(num(l.pagoMonto) > 0) || !l.pagoDireccion) continue;
    const entro = l.pagoDireccion === "recibido";
    (entro ? filas.liquidacion_recibida : filas.liquidacion_pagada).push({
      id: l.id, fecha: dia, quien: l.personaNombre?.trim() || null, que: `Liquidación ${l.codigo}`,
      monto: r2(num(l.pagoMonto)), pt: null, m3: null, certeza: "medido",
      enlace: { tab: "plata", params: { vista: "adelantos", liquidacion: l.codigo } },
    });
  }

  // ── Adelantos: el alta UNA vez (su egreso de caja no se suma aparte) ──
  for (const a of e.adelantos) {
    const dia = diaDeFecha(a.fechaAdelanto);
    if (!del(dia)) continue;
    if (!esSoles(a.moneda)) {
      monedas.sumar(a.moneda, num(a.montoAdelantado));
      continue;
    }
    const entro = a.direccion === "RECIBIDO";
    (entro ? filas.adelanto_recibido : filas.adelanto_dado).push({
      id: a.id, fecha: dia, quien: a.beneficiario?.trim() || null,
      que: `${entro ? "Te adelantaron" : "Adelanto"}${a.codigo ? ` ${a.codigo}` : ""}`,
      monto: r2(num(a.montoAdelantado)), pt: null, m3: null, certeza: "medido",
      enlace: { tab: "plata", params: { vista: "adelantos", ...(a.codigo ? { adelanto: a.codigo } : {}) } },
    });
  }
  // Entregas: la devuelta en plata tiene su movimiento de caja (mismo código,
  // mismo monto, `cajaAlDevolver`); ese sí es caja, UNA vez. La de trabajo o
  // producto nunca lo fue. Las de una liquidación ya se contaron en su cabecera.
  const palabraCodigo = (c: string) => new RegExp(`(^|[^A-Za-z0-9-])${escaparRe(c)}($|[^A-Za-z0-9-])`);
  const movDeEntrega = new Map<string, string>();
  for (const en of e.entregas) {
    const dia = diaDeFecha(en.fecha);
    if (!del(dia) || en.liquidacionId) continue;
    const dado = en.direccion === "DADO";
    const tipo = dado ? "ingreso" : "egreso";
    const prefijo = dado ? PREFIJO_DEVOLUCION_DADO : PREFIJO_DEVOLUCION_RECIBIDO;
    const re = en.adelantoCodigo ? palabraCodigo(en.adelantoCodigo) : null;
    const mov = re
      ? e.movimientosCaja.find(
          (m) =>
            !movDeEntrega.has(m.id) &&
            m.type === tipo &&
            Math.abs(num(m.amount) - num(en.valor)) < 0.005 &&
            (m.description ?? "").startsWith(prefijo) &&
            re.test(m.description ?? ""),
        )
      : undefined;
    if (!mov) {
      nunca.cuantos += 1;
      nunca.monto = r2(nunca.monto + num(en.valor));
      continue;
    }
    movDeEntrega.set(mov.id, en.adelantoCodigo ?? "");
    (dado ? filas.adelanto_devuelto : filas.recibido_devuelto).push({
      id: en.id, fecha: dia, quien: en.beneficiario?.trim() || null,
      que: `${dado ? "Te devolvieron en plata" : "Devolviste en plata"} · ${en.adelantoCodigo}`,
      monto: r2(num(en.valor)), pt: null, m3: null, certeza: "medido",
      enlace: { tab: "plata", params: { vista: "adelantos", adelanto: en.adelantoCodigo ?? "" } },
    });
  }

  // ── Gastos y fletes pagados ───────────────────────────────────────────
  for (const g of e.gastos) {
    // Un gasto de guía se anota antes de pagarse: sin `paidAt` no salió plata.
    if (g.gtfNumber?.trim() && g.paidAt == null) continue;
    const dia = diaDeFecha(g.paidAt ?? g.date);
    if (!del(dia)) continue;
    filas.gastos_pagados.push({
      id: g.id, fecha: dia, quien: g.supplierName?.trim() || null, que: queDelGasto(g),
      monto: r2(num(g.amount)), pt: null, m3: null, certeza: "medido", enlace: { tab: "plata", params: { vista: "gastos" } },
    });
  }
  for (const f of e.fletes) {
    if (claseDeFlete(f) !== "pagado" || f.estadoPago !== "pagado") continue;
    const dia = diaDeFecha(f.fechaPago ?? f.fecha);
    if (!del(dia)) continue;
    if (!esSoles(f.moneda)) {
      monedas.sumar(f.moneda, num(f.monto));
      continue;
    }
    filas.fletes_pagados_caja.push({
      id: f.id, fecha: dia, quien: f.quien?.trim() || null,
      que: f.gtfNumber?.trim() ? `Flete · guía ${f.gtfNumber.trim()}` : "Flete",
      monto: r2(num(f.monto)), pt: f.pt, m3: f.m3, certeza: "medido", enlace: { tab: "forestal-herramientas", params: { vista: "fletes" } },
    });
  }

  // ── Retiros e ingresos manuales de caja: se muestran, no se suman ─────
  const palabra = (c: string) => new RegExp(`(^|[^A-Za-z0-9-])${escaparRe(c)}($|[^A-Za-z0-9-])`);
  const codigos = e.codigosAdelanto.filter(Boolean).map((c) => ({ c, re: palabra(c) }));
  const movDeLiquidacion = new Set<string>();
  for (const l of e.cajaDeLiquidaciones) {
    if (l.cajaMovimientoId) movDeLiquidacion.add(l.cajaMovimientoId);
    if (l.cajaReversionId) movDeLiquidacion.add(l.cajaReversionId);
  }
  const codigosLiq = e.cajaDeLiquidaciones.filter((l) => l.codigo).map((l) => ({ c: l.codigo, re: palabra(l.codigo) }));
  for (const mv of e.movimientosCaja) {
    if (mv.type !== "ingreso" && mv.type !== "egreso") continue;
    const dia = diaLima(mv.createdAt);
    if (!del(dia)) continue;
    const texto = mv.description ?? "";
    const codigo = codigos.find((x) => x.re.test(texto))?.c ?? null;
    const codigoLiq = codigosLiq.find((x) => x.re.test(texto))?.c ?? null;
    const esLiquidacion = movDeLiquidacion.has(mv.id) || codigoLiq != null;
    const ya = movDeEntrega.has(mv.id)
      ? ` · ya contado: devolución del adelanto ${movDeEntrega.get(mv.id)}`
      : codigo
        ? ` · del adelanto ${codigo}`
        : esLiquidacion
          ? ` · es el pago de una liquidación${codigoLiq ? ` (${codigoLiq})` : ""}`
          : "";
    filas.caja_sin_sumar.push({
      id: mv.id, fecha: dia, quien: null,
      que: `${mv.type === "ingreso" ? "Ingreso" : "Retiro"} de caja${mv.description?.trim() ? `: ${mv.description.trim()}` : ""}${ya}`,
      monto: r2(mv.type === "ingreso" ? num(mv.amount) : -num(mv.amount)), pt: null, m3: null, certeza: "medido",
      enlace: { tab: "ventas-caja", params: { vista: "caja-registradora" } },
    });
  }
  if (filas.caja_sin_sumar.length > 0) {
    avisos.push({
      codigo: "caja_manual_sin_sumar", fuente: "caja_sin_sumar", cuantos: filas.caja_sin_sumar.length,
      texto: `${plural(filas.caja_sin_sumar.length, "movimiento manual", "movimientos manuales")} de caja se muestran y no se suman: suelen ser la otra cara de un gasto o de un adelanto.`,
    });
  }
  const otrasMonedas = monedas.lista();
  if (otrasMonedas.length > 0) {
    avisos.push({
      codigo: "otras_monedas", fuente: null, cuantos: otrasMonedas.reduce((a, m) => a + m.cuantos, 0),
      texto: `Hay montos en ${otrasMonedas.map((m) => m.moneda).join(", ")}: no se suman a los soles.`,
    });
  }
  for (const k of Object.keys(filas) as ClaveCaja[]) filas[k].sort((a, b) => b.fecha.localeCompare(a.fecha) || a.id.localeCompare(b.id));
  return { filas, nuncaCaja: nunca, avisos, otrasMonedas };
}

const NOTAS_CAJA: Record<FuenteCaja, string> = {
  mostrador_cobrado: "Ventas del mostrador que no fueron fiado, y lo que se cobró de fiados.",
  pedidos_cobrados: "Pedidos entregados que no quedaron a cuenta.",
  cobros_forestales: "Pagos que te hicieron en la cuenta forestal, fuera de una liquidación.",
  liquidacion_recibida: "Lo que te pagaron al liquidar. Se cuenta una vez: sus movimientos no se suman aparte.",
  adelanto_recibido: "Plata que te adelantaron.",
  adelanto_devuelto: "Lo que te devolvieron en plata de un adelanto. Su ingreso de caja no se suma aparte.",
  adelanto_dado: "Adelantos que diste. Su retiro de caja no se suma aparte.",
  pagos_forestales: "Pagos que hiciste en la cuenta forestal, fuera de una liquidación.",
  liquidacion_pagada: "Lo que pagaste al liquidar.",
  gastos_pagados: "Gastos pagados en el mes.",
  fletes_pagados_caja: "Fletes que pagaste.",
  recibido_devuelto: "Lo que devolviste en plata de lo que te adelantaron.",
};

function aRenglonCaja(fuente: FuenteCaja, lado: "entro" | "salio", c: CalculoCaja): RenglonCaja {
  const filas = c.filas[fuente];
  return {
    fuente, lado, monto: sumaFilas(filas),
    certeza: filas.some((f) => f.certeza !== "medido") ? "estimado" : "medido",
    cuantos: filas.length, nota: NOTAS_CAJA[fuente],
  };
}

/** Lo que entró y salió en un mes de Lima, sin dobles. */
export function armarCaja(mes: string, e: EntradaCaja): CajaDelMes {
  const c = calcularCaja(mes, e);
  const entro = FUENTES_ENTRO.map((f) => aRenglonCaja(f, "entro", c));
  const salio = FUENTES_SALIO.map((f) => aRenglonCaja(f, "salio", c));
  const totalEntro = r2(entro.reduce((a, r) => a + r.monto, 0));
  const totalSalio = r2(salio.reduce((a, r) => a + r.monto, 0));
  const manual = c.filas.caja_sin_sumar;
  return {
    mes, entro, salio, totalEntro, totalSalio,
    neto: r2(totalEntro - totalSalio),
    estimado: [...entro, ...salio].some((r) => r.certeza !== "medido"),
    sinSumar: {
      cuantos: manual.length,
      ingresos: r2(manual.filter((f) => f.monto > 0).reduce((a, f) => a + f.monto, 0)),
      egresos: r2(-manual.filter((f) => f.monto < 0).reduce((a, f) => a + f.monto, 0)),
      nota: "Retiros e ingresos a mano en la caja registradora. Se muestran y no se suman: suelen ser la otra cara de un gasto o de un adelanto.",
    },
    nuncaCaja: {
      ...c.nuncaCaja,
      nota: "Cruces de una liquidación y entregas en trabajo o producto: bajan una deuda, no mueven plata.",
    },
    avisos: c.avisos,
    otrasMonedas: c.otrasMonedas,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Lo que viene
// ═══════════════════════════════════════════════════════════════════════════

export interface EntradaViene {
  /** Saldo por parte de la cuenta forestal (`saldosPorParte`): positivo = te debe. */
  saldosCuenta: { parteId: string; nombre: string; saldo: number }[];
  /** Adelantos ABIERTOS con saldo, en los dos sentidos. */
  adelantos: {
    id: string;
    codigo: string | null;
    direccion: "DADO" | "RECIBIDO";
    saldoPendiente: number;
    moneda: string | null;
    fechaVencimiento: Fecha | null;
    beneficiario: string | null;
    /** Con este id el enlace abre Liquidar de ESA persona (`?accion=liquidar&persona=<id>`). */
    beneficiarioId: string | null;
  }[];
  fiados: { id: string; saldo: number; fechaVence: Fecha | null; cliente: string | null }[];
  payables: { id: string; pendiente: number; dueDate: Fecha | null; proveedor: string | null }[];
  /**
   * ≈ Lo ganado del mes en curso menos lo pagado como gasto de personal.
   * `null` = sin personal cargado; `"sin_permiso"` = quien pide no ve lo ganado.
   */
  planillaPorPagar: { monto: number; personas: number } | null | "sin_permiso";
  /** Saldos de la cuenta forestal en otra moneda (neto por moneda): no se suman a los soles. */
  otrasMonedasCuenta?: OtraMoneda[];
}

function item(
  tipo: TipoViene,
  lado: ItemViene["lado"],
  filas: QuienViene[],
  nota: string,
  enlace: EnlaceOrigen,
  certeza: Certeza = "medido",
): ItemViene {
  const quienes = [...filas].sort((a, b) => b.monto - a.monto);
  return {
    tipo, lado, monto: r2(quienes.reduce((a, q) => a + q.monto, 0)), certeza, cuantos: quienes.length,
    quienes: quienes.slice(0, 8), nota, enlace,
  };
}

/** Lo que te deben, lo que debes y lo que se cruza: estado de hoy, no del mes. */
export function loQueViene(e: EntradaViene): LoQueViene {
  const vence = (v: Fecha | null) => (v ? diaDeFecha(v) || null : null);
  const items: ItemViene[] = [];
  const porCobrar = { tab: "plata", params: { vista: "por-cobrar" } };

  const teDeben = e.saldosCuenta.filter((s) => s.saldo > 0.005).map((s) => ({ nombre: s.nombre?.trim() || "Sin nombre", monto: r2(s.saldo), vence: null }));
  const leDebes = e.saldosCuenta.filter((s) => s.saldo < -0.005).map((s) => ({ nombre: s.nombre?.trim() || "Sin nombre", monto: r2(-s.saldo), vence: null }));
  const soles = e.adelantos.filter((a) => esSoles(a.moneda) && a.saldoPendiente > 0.005);
  const aQuien = (a: EntradaViene["adelantos"][number]) => ({ nombre: a.beneficiario?.trim() || a.codigo || "Sin nombre", monto: r2(a.saldoPendiente), vence: vence(a.fechaVencimiento) });

  items.push(item("te_deben_cuenta", "entra", teDeben, "Saldo a tu favor en la cuenta forestal: aserríos, madera y fletes que falta cobrar.", porCobrar));
  /* Un ítem POR PERSONA, cada uno con su enlace a Liquidar: la pantalla de
     Cuentas por persona abre el modal con `?accion=liquidar&persona=<id>`
     (`components/admin/adelantos/cuentas/liquidar-por-url.ts`, mismas claves;
     un test lo fija). Sin persona, un solo ítem vacío que abre la lista. */
  const notaCruzar = "Ya te lo adelantaron: se cruza contra lo que te deben al liquidar. No es plata por entrar.";
  const aLiquidar = (persona: string | null): EnlaceOrigen => ({
    tab: "plata",
    params: { vista: "adelantos", [PARAM_ACCION_LIQUIDAR]: ACCION_LIQUIDAR, ...(persona ? { [PARAM_PERSONA_LIQUIDAR]: persona } : {}) },
  });
  const recibidosPorPersona = new Map<string, EntradaViene["adelantos"]>();
  for (const a of soles) {
    if (a.direccion !== "RECIBIDO") continue;
    const k = a.beneficiarioId ?? `sin-persona:${a.id}`;
    recibidosPorPersona.set(k, [...(recibidosPorPersona.get(k) ?? []), a]);
  }
  if (recibidosPorPersona.size === 0) items.push(item("recibido_para_cruzar", "cruzar", [], notaCruzar, aLiquidar(null)));
  for (const lista of recibidosPorPersona.values()) {
    items.push(item("recibido_para_cruzar", "cruzar", lista.map(aQuien), notaCruzar, aLiquidar(lista[0]?.beneficiarioId ?? null)));
  }
  items.push(item("adelantos_por_cobrar", "entra", soles.filter((a) => a.direccion === "DADO").map(aQuien), "Adelantos que diste y siguen abiertos.", { tab: "plata", params: { vista: "adelantos" } }));
  items.push(item("fiados", "entra", e.fiados.filter((f) => f.saldo > 0.005).map((f) => ({ nombre: f.cliente?.trim() || "Cliente sin nombre", monto: r2(f.saldo), vence: vence(f.fechaVence) })), "Lo que se llevaron anotado en el mostrador.", { tab: "plata", params: { vista: "fiados" } }));
  items.push(item("le_debes_cuenta", "sale", leDebes, "Saldo a favor de la otra parte en la cuenta forestal.", porCobrar));
  items.push(item("por_pagar_proveedores", "sale", e.payables.filter((p) => p.pendiente > 0.005).map((p) => ({ nombre: p.proveedor?.trim() || "Proveedor", monto: r2(p.pendiente), vence: vence(p.dueDate) })), "Cuentas por pagar a proveedores.", { tab: "compras", params: { vista: "ordenes-compra" } }));
  const pl = e.planillaPorPagar;
  if (pl === "sin_permiso") {
    items.push({
      tipo: "planilla_por_pagar", lado: "sale", monto: null, certeza: "incompleto", cuantos: 0, quienes: [],
      nota: NOTA_PLANILLA_SIN_PERMISO, enlace: { tab: "rrhh", params: {} },
    });
  } else {
    items.push({
      tipo: "planilla_por_pagar", lado: "sale",
      monto: pl ? r2(Math.max(0, pl.monto)) : 0,
      certeza: pl && pl.monto > 0 ? "estimado" : "medido",
      cuantos: pl?.personas ?? 0, quienes: [],
      nota: pl ? "≈ Lo ganado este mes según la asistencia, menos lo que ya anotaste como gasto de personal." : "Sin personal cargado en Recursos Humanos.",
      enlace: { tab: "rrhh", params: {} },
    });
  }

  const suma = (lado: ItemViene["lado"]) => r2(items.filter((i) => i.lado === lado).reduce((a, i) => a + (i.monto ?? 0), 0));
  // Lo que no está en soles se dice aparte, por moneda (cuenta forestal + adelantos).
  const porMoneda = new Map<string, OtraMoneda>();
  const sumarMoneda = (moneda: string | null | undefined, cuantos: number, total: number) => {
    const k = (moneda?.trim() || "PEN").toUpperCase();
    const prev = porMoneda.get(k) ?? { moneda: k, cuantos: 0, total: 0 };
    porMoneda.set(k, { moneda: k, cuantos: prev.cuantos + cuantos, total: r2(prev.total + total) });
  };
  for (const o of e.otrasMonedasCuenta ?? []) sumarMoneda(o.moneda, o.cuantos, o.total);
  for (const a of e.adelantos) if (!esSoles(a.moneda) && a.saldoPendiente > 0.005) sumarMoneda(a.moneda, 1, a.saldoPendiente);
  return {
    items,
    porCobrar: suma("entra"),
    porPagar: suma("sale"),
    paraCruzar: suma("cruzar"),
    estimado: items.some((i) => i.certeza !== "medido"),
    otrasMonedas: [...porMoneda.values()].sort((a, b) => a.moneda.localeCompare(b.moneda)),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Detalle: las MISMAS filas que suman el renglón
// ═══════════════════════════════════════════════════════════════════════════

const ES_CAJA = new Set<string>([...FUENTES_ENTRO, ...FUENTES_SALIO, "caja_sin_sumar"]);

/** ¿La fuente se arma con la entrada de la caja (y no con la del resultado)? */
export function esFuenteDeCaja(f: FuenteDetalle): f is FuenteCaja | "caja_sin_sumar" {
  return ES_CAJA.has(f);
}

/** Filas de una fuente del resultado (o del memo de compras) en el mes. */
export function detalleDeResultado(mes: string, fuente: Exclude<FuenteDetalle, FuenteCaja | "caja_sin_sumar">, e: EntradaResultado): RespuestaDetalle {
  const c = calcularResultado(mes, e);
  const filas = c.filas[fuente];
  // Mismo criterio que el renglón (y que el memo: compras sin ningún costo = «—»).
  const nulo = fuente === "compras_madera" ? filas.length === 0 && c.comprasSinCosto > 0 : c.nulos.has(fuente);
  return { mes, fuente, filas, total: nulo ? null : sumaFilas(filas) };
}

/** Filas de una fuente de la caja (o de los movimientos manuales) en el mes. */
export function detalleDeCaja(mes: string, fuente: FuenteCaja | "caja_sin_sumar", e: EntradaCaja): RespuestaDetalle {
  const filas = calcularCaja(mes, e).filas[fuente];
  return { mes, fuente, filas, total: sumaFilas(filas) };
}
