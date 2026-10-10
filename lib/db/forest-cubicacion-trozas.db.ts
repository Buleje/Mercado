import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { logger } from "@/lib/logger";
import { getOrSet, invalidateByPrefix } from "@/lib/cache";
import { limaDateKey } from "@/lib/utils";
import { siguienteCodigo } from "@/lib/adelantos/codigo-operacion";
import { auditCtp, auditCtpEsperando, type CtpAuditAction } from "@/lib/forestal/ctp-audit";
import { AdelantosDB, IdempotenciaDistintaError } from "@/lib/db/adelantos.db";
import { ForestCuentaDB } from "@/lib/db/forest-cuenta.db";
import { bloquearLineasDeDespachoEnTx, cubicacionQuePagoLaGuia, cubicacionQueVendioLaGuia, despachosDeLaGuiaDeSalida, filtroMismaGuia } from "@/lib/db/guia-cubicacion.db";
import { mismoNumeroGtf, puedeSerLaMismaGtf } from "@/lib/forestal/gtf-talonario";
import {
  FaltaPrecioError,
  MedidaFueraDeRangoError,
  PREFIJO_CUBICACION,
  decimalesDe,
  descripcionEntregaMadera,
  direccionDelSentido,
  fmtVolumen,
  huellaAplicar,
  repartirConCuenta,
  unidadDe,
  valorizar,
  type AdelantoAbierto,
  type AplicarCubicacionInput,
  type CubicacionTrozasDTO,
  type CubicacionTrozasResumen,
  type EditarCubicacionInput,
  type EstadoCubicacion,
  type GuardarCubicacionInput,
  type ImputacionGuardada,
  type LineaEspecie,
  type TrozaCongelada,
} from "@/lib/forestal/cubicacion-cuenta";
import { aplicarDescuentoLote, cubicarTrozasComercial, DescuentoInvalidoError, lineasDeEspecie } from "@/lib/forestal/cubicacion-comercial";
import {
  mensajeSinCuenta,
  patasDeCuenta,
  repartirValorVenta,
  restoEnPalabras,
  separarImputacion,
  type CuentaDeCubicacion,
  type ValorVentaDeCubicacion,
} from "@/lib/forestal/cubicacion-a-cuenta";
import { ForestCtpCierreDB } from "@/lib/db/forest-ctp-cierre.db";
import { claveCacheResultado } from "@/lib/finance/resultado-del-negocio";
import { isSpecializationEnabled } from "@/lib/specializations";
import {
  esFormulaComercial,
  type DescuentoLote,
  type FormulaComercial,
  type LineaTotalCongelada,
  type MaterialCubicacion,
  type OrigenCubicacion,
  type PiezaCongelada,
} from "@/lib/forestal/cubicacion-comercial-tipos";

/**
 * ForestCubicacionTrozasDB — la cubicación de trozas guardada con dueño y, al
 * aplicarla, la plata que baja (o devuelve) sus adelantos (ADR-478, contrato K2).
 *
 * ORQUESTA, como `LiquidacionCuentaDB`: las entregas las escribe SÓLO
 * `AdelantosDB.registrarEntregaEnTx`, dentro de UNA transacción con la
 * cabecera. Locks en el mismo orden que la liquidación y el modal de la guía:
 * guía → persona → la cubicación → los adelantos destino por id.
 *
 * `tenantId` 1er parámetro y en todo WHERE; la persona, el permiso y los
 * adelantos se releen con `tenantId` (refs. app-level sin FK, ADR-426).
 *
 * ADR-483: la misma tabla guarda la cubicación COMERCIAL (con descuentos) de
 * trozas de una GTF del Libro TH (`origen = loth`) y la de madera aserrada
 * (`material = aserrada`, fórmula `tablar`, alta en `CubicacionComercialDB`).
 * Aplicar, anular y borrar son los de acá para todas.
 */

export type CodigoCubicacion =
  | "NO_ENCONTRADA"
  | "PERSONA_NO_ENCONTRADA"
  | "CONTRATO_NO_ENCONTRADO"
  | "MEDIDA_FUERA_DE_RANGO"
  | "DESACTUALIZADA"
  | "YA_APLICADA"
  | "ANULADA"
  | "NO_APLICADA"
  | "MONTO_CAMBIO"
  | "MONTO_CERO"
  | "GUIA_YA_VALORIZADA"
  | "GUIA_NO_ENCONTRADA"
  | "SIN_CUENTA"
  | "GUIA_YA_ANOTADA"
  | "MONEDA_NO_SOPORTADA"
  | "FALTA_PRECIO"
  | "ADELANTO_NO_VALIDO"
  | "IDEMPOTENCIA_DISTINTA"
  | "LIQUIDADA_DESPUES"
  | "ADELANTO_ANULADO"
  | "DESCUENTO_INVALIDO"
  | "ORIGEN_NO_ENCONTRADO"
  | "GUIA_ANULADA"
  | "DESPACHO_YA_VALORIZADO"
  | "CUBICACION_REF_NO_ENCONTRADA"
  | "MATERIAL_DISTINTO"
  | "ORIGEN_DISTINTO"
  | "REF_YA_VALORIZADA";

const STATUS: Record<CodigoCubicacion, 404 | 409 | 422> = {
  NO_ENCONTRADA: 404,
  PERSONA_NO_ENCONTRADA: 404,
  CONTRATO_NO_ENCONTRADO: 404,
  MEDIDA_FUERA_DE_RANGO: 422,
  DESACTUALIZADA: 409,
  YA_APLICADA: 409,
  ANULADA: 409,
  NO_APLICADA: 409,
  MONTO_CAMBIO: 409,
  MONTO_CERO: 422,
  GUIA_YA_VALORIZADA: 409,
  GUIA_NO_ENCONTRADA: 422,
  SIN_CUENTA: 422,
  GUIA_YA_ANOTADA: 409,
  MONEDA_NO_SOPORTADA: 422,
  FALTA_PRECIO: 422,
  ADELANTO_NO_VALIDO: 422,
  IDEMPOTENCIA_DISTINTA: 422,
  LIQUIDADA_DESPUES: 409,
  ADELANTO_ANULADO: 409,
  DESCUENTO_INVALIDO: 422,
  ORIGEN_NO_ENCONTRADO: 404,
  GUIA_ANULADA: 422,
  DESPACHO_YA_VALORIZADO: 409,
  CUBICACION_REF_NO_ENCONTRADA: 404,
  MATERIAL_DISTINTO: 409,
  ORIGEN_DISTINTO: 409,
  REF_YA_VALORIZADA: 409,
};

/** Error de negocio: la ruta responde `{ error: code, message, ...extra }` con `status`. */
export class CubicacionTrozasError extends Error {
  readonly status: 404 | 409 | 422;
  constructor(
    readonly code: CodigoCubicacion,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "CubicacionTrozasError";
    this.status = STATUS[code];
  }
}

export interface ActorCubicacion {
  usuario: string;
  ip?: string | null;
}

type Tx = Prisma.TransactionClient;
export type DbCubicacion = Tx | typeof prisma;
type Db = DbCubicacion;
export type RowCubicacion = NonNullable<Awaited<ReturnType<typeof prisma.forestCubicacionTrozas.findFirst>>>;
type Row = RowCubicacion;
type RowResumen = Omit<Row, "trozas">;

const CACHE = "forest-cubic-trozas";
const TX_OPTS = { timeout: 20_000, maxWait: 10_000 } as const;
/* Sólo ABIERTO (ADR-484): un EXCEDIDO no tiene saldo y el sobrante ya no se le carga: va a la cuenta. */
const ABIERTOS = ["ABIERTO"] as const;
const ESTADOS_GUIA_MUERTA = ["anulado", "rechazado"] as const;

const SELECT_RESUMEN = {
  id: true, tenantId: true, codigo: true, fecha: true, formula: true, diametros: true, beneficiarioId: true,
  parteId: true, personaNombre: true, sentido: true, gtfNumber: true, contratoId: true, nTrozas: true, volumen: true,
  porEspecie: true, monto: true, moneda: true, estado: true, version: true, aplicadaAt: true, aplicadaPor: true,
  imputacion: true, idempotencyKey: true, idempotencyHuella: true, anuladaAt: true, anuladaPor: true,
  motivoAnulacion: true, notas: true, createdBy: true, createdAt: true, updatedAt: true, deletedAt: true,
  material: true, origen: true, origenId: true, modo: true, volumenBruto: true, descuentos: true,
  referenciaSmalianM3: true, cubicacionRefId: true,
} satisfies Prisma.ForestCubicacionTrozasSelect;

const iso = (d: Date | null) => (d ? d.toISOString() : null);
const arr = <T>(v: Prisma.JsonValue | null | undefined): T[] | null => (Array.isArray(v) ? (v as unknown as T[]) : null);
const esChoqueUnico = (err: unknown) => typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
const estadoDe = (e: string): EstadoCubicacion => (e === "aplicada" || e === "anulada" ? e : "borrador");
/** La entrega se fecha con la hora real si es de hoy, y al mediodía de Lima si no (como la liquidación). */
const fechaEntrega = (fecha: string) => (fecha === limaDateKey() ? undefined : `${fecha}T12:00:00-05:00`);

const ORIGENES = new Set<string>(["libre", "ctp", "loth", "despacho"]);
const esOrigen = (v: string | null): v is OrigenCubicacion => v != null && ORIGENES.has(v);
/** Toda fórmula de la fila tal cual (tablar NUNCA se lee como smalian: serían soles por m³ sobre PT). */
const formulaDe = (f: string): FormulaComercial => (esFormulaComercial(f) ? f : "smalian");
const materialDe = (m: string | null | undefined): MaterialCubicacion => (m === "aserrada" ? "aserrada" : "troza");
const decimalONull = (d: Prisma.Decimal | null) => (d == null ? null : Number(d));
/** El descuento del lote guardado; cualquier otra cosa (null, un DbNull, basura) = sin descuento. */
function descuentosDe(v: Prisma.JsonValue | null | undefined): DescuentoLote | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const d = v as { pct?: unknown; porEspecie?: unknown };
  return typeof d.pct === "number" || Array.isArray(d.porEspecie) ? (v as unknown as DescuentoLote) : null;
}

/** `imputacion` guardada → los adelantos, la cuenta y el valor de venta (ADR-484), cada uno en su campo. */
function imputacionDe(v: Prisma.JsonValue | null): Pick<CubicacionTrozasResumen, "imputacion" | "aCuenta" | "valorVenta"> {
  const { adelantos, cuenta, valorVenta } = separarImputacion(v);
  return { imputacion: adelantos, aCuenta: cuenta, valorVenta };
}

function aResumen(r: RowResumen): CubicacionTrozasResumen {
  const formula = formulaDe(r.formula);
  return {
    id: r.id, codigo: r.codigo, fecha: r.fecha.toISOString().slice(0, 10), formula,
    diametros: r.diametros === 1 ? 1 : 2, unidad: unidadDe(formula),
    beneficiarioId: r.beneficiarioId, parteId: r.parteId, personaNombre: r.personaNombre,
    sentido: r.sentido === "venta" ? "venta" : "compra", gtfNumber: r.gtfNumber, contratoId: r.contratoId,
    nTrozas: r.nTrozas, volumen: Number(r.volumen), porEspecie: arr<LineaEspecie>(r.porEspecie),
    monto: r.monto == null ? null : Number(r.monto), moneda: r.moneda, estado: estadoDe(r.estado), version: r.version,
    aplicadaAt: iso(r.aplicadaAt), aplicadaPor: r.aplicadaPor, ...imputacionDe(r.imputacion),
    anuladaAt: iso(r.anuladaAt), anuladaPor: r.anuladaPor, motivoAnulacion: r.motivoAnulacion, notas: r.notas,
    createdBy: r.createdBy, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
    material: materialDe(r.material), origen: esOrigen(r.origen) ? r.origen : null, origenId: r.origenId,
    modo: r.modo === "total" ? "total" : "pieza", volumenBruto: decimalONull(r.volumenBruto),
    descuentos: descuentosDe(r.descuentos), referenciaSmalianM3: decimalONull(r.referenciaSmalianM3),
    cubicacionRefId: r.cubicacionRefId,
  };
}
/** Las medidas congeladas van en `trozas`, `piezas` (aserrada uno por uno) o `lineas` (aserrada rápida). */
export function aDTO(r: Row): CubicacionTrozasDTO {
  const base = aResumen(r);
  const medidas = arr<unknown>(r.trozas) ?? [];
  if (base.material !== "aserrada") return { ...base, trozas: medidas as TrozaCongelada[] };
  return base.modo === "total"
    ? { ...base, trozas: [], lineas: medidas as LineaTotalCongelada[] }
    : { ...base, trozas: [], piezas: medidas as PiezaCongelada[] };
}

export function invalidar(tenantId: string): void {
  try {
    invalidateByPrefix(`${CACHE}:${tenantId}:`);
  } catch (err) {
    logger.error("[forest-cubicacion-trozas] no se pudo invalidar la caché", { error: String(err), tenantId });
  }
}

/** La persona del cuerpo, releída con `tenantId`: otra de otro negocio = 404. */
export async function resolverPersona(db: Db, tenantId: string, input: { beneficiarioId?: string; parteId?: string }) {
  const benef = input.beneficiarioId
    ? await db.adelantoBeneficiario.findFirst({ where: { id: input.beneficiarioId, tenantId }, select: { id: true, nombre: true } })
    : null;
  const parte = input.parteId
    ? await db.forestParty.findFirst({ where: { id: input.parteId, tenantId, deletedAt: null }, select: { id: true, nombre: true } })
    : null;
  if ((input.beneficiarioId && !benef) || (input.parteId && !parte)) {
    throw new CubicacionTrozasError("PERSONA_NO_ENCONTRADA", "Esa persona no está en las cuentas de este negocio.");
  }
  return { beneficiarioId: benef?.id ?? null, parteId: parte?.id ?? null, nombre: benef?.nombre ?? parte?.nombre ?? null };
}

/** La cuenta de adelantos de la cubicación: su ficha, o la vinculada a su parte del directorio. */
async function beneficiarioDe(db: Db, tenantId: string, c: { beneficiarioId: string | null; parteId: string | null }): Promise<string | null> {
  if (c.beneficiarioId) {
    const b = await db.adelantoBeneficiario.findFirst({ where: { id: c.beneficiarioId, tenantId }, select: { id: true } });
    return b?.id ?? null;
  }
  if (!c.parteId) return null;
  const b = await db.adelantoBeneficiario.findFirst({ where: { tenantId, forestPartyId: c.parteId }, select: { id: true } });
  return b?.id ?? null;
}

/**
 * Los adelantos a los que puede ir la madera: estado ABIERTO (`ABIERTOS`), del
 * lado del sentido (compra → DADO, venta → RECIBIDO), en SOLES y sin cuotas
 * pactadas — los mismos filtros que `clasificarAdelantos` de la liquidación
 * (lib/cuentas/liquidacion.ts): la cubicación vale en soles (S/ 586,36 no son
 * $ 586,36) y una entrega suelta no marca la cuota de un adelanto pactado.
 *
 * ADR-484 cerró B1: el EXCEDIDO ya no entra. Antes el sobrante de un DADO se
 * le cargaba al último adelanto (quedaba excedido, «págalo aparte»); ahora
 * cada adelanto toma hasta su saldo y el resto va a la cuenta de la persona.
 */
async function abiertosDe(
  db: Db,
  tenantId: string,
  beneficiarioId: string,
  direccion: "DADO" | "RECIBIDO",
  ids?: readonly string[],
): Promise<(AdelantoAbierto & { status: string })[]> {
  const rows = await db.adelanto.findMany({
    where: {
      tenantId, beneficiarioId, direccion, status: { in: [...ABIERTOS] },
      moneda: "PEN", modalidad: { not: "ENTREGAS_PACTADAS" }, entregasPactadas: { none: {} },
      ...(ids ? { id: { in: [...ids] } } : {}),
    },
    select: { id: true, codigoOperacion: true, fechaAdelanto: true, saldoPendiente: true, direccion: true, status: true },
    orderBy: [{ fechaAdelanto: "asc" }, { id: "asc" }],
    take: 200,
  });
  return rows.map((a) => ({
    id: a.id, codigoOperacion: a.codigoOperacion, fecha: a.fechaAdelanto.toISOString(),
    saldo: Number(a.saldoPendiente), direccion: a.direccion === "RECIBIDO" ? "RECIBIDO" : "DADO", status: a.status,
  }));
}

/**
 * La cuenta forestal de la persona (ADR-484): su parte del directorio, o la
 * vinculada a su ficha de adelantos. Viva y de ESTE negocio; si no, null.
 */
async function parteDe(db: Db, tenantId: string, c: { beneficiarioId: string | null; parteId: string | null }): Promise<{ id: string; nombre: string } | null> {
  let parteId = c.parteId;
  if (!parteId && c.beneficiarioId) {
    const b = await db.adelantoBeneficiario.findFirst({ where: { id: c.beneficiarioId, tenantId }, select: { forestPartyId: true } });
    parteId = b?.forestPartyId ?? null;
  }
  if (!parteId) return null;
  return db.forestParty.findFirst({ where: { id: parteId, tenantId, deletedAt: null }, select: { id: true, nombre: true } });
}

/**
 * Una venta, una sola deuda: si la venta de la guía ya se anotó en una cuenta
 * («Anotar en la cuenta» del despacho, ADR-437), cobrarla otra vez con la
 * cubicación la deja debiendo dos veces. Bajo el candado de la guía; compara
 * con `puedeSerLaMismaGtf` (la regla del candado: «065» = «019-001-0000065»),
 * por la referencia o por la guía del movimiento.
 */
async function exigirVentaSinAnotar(tx: Tx, tenantId: string, guias: readonly string[]): Promise<void> {
  for (const gtf of guias) {
    const filtro = filtroMismaGuia(gtf) ?? gtf;
    const filas = await tx.forestCuentaMov.findMany({
      where: { tenantId, deletedAt: null, concepto: "venta", tipo: "cargo", OR: [{ referencia: filtro }, { gtfNumber: filtro }] },
      select: { referencia: true, gtfNumber: true, parteNombre: true },
      take: 200,
    });
    const ya = filas.find((f) => f.referencia === gtf || f.gtfNumber === gtf || puedeSerLaMismaGtf(f.referencia, gtf) || puedeSerLaMismaGtf(f.gtfNumber, gtf));
    if (ya) {
      throw new CubicacionTrozasError(
        "GUIA_YA_ANOTADA",
        `La venta de la guía ${gtf} ya está anotada en la cuenta de ${ya.parteNombre}: cobrarla con la cubicación la dejaría debiendo dos veces.`,
        { gtfNumber: gtf },
      );
    }
  }
}

/**
 * ADR-484 (2): la VENTA ligada a un despacho llena el valor de venta de sus
 * líneas si TODAS están vacías (`repartirValorVenta`). Con valor no se pisa;
 * mes cerrado no se toca (ADR-139, como `setValorVenta`). La escritura lleva
 * `valorVenta: null` en el WHERE: si alguien lo puso mientras tanto, esa línea
 * queda como la dejó.
 *
 * `comoElCargo`: con la venta también en la cuenta, sólo las líneas cuya guía
 * está escrita IGUAL que el cargo. Una línea con la misma guía escrita de otro
 * modo («19-2-9» junto a «019-002-0000009») podría quedar en otro grupo del
 * resultado del negocio y la venta sumaría dos veces (1 400 en vez de 1 000).
 */
async function llenarValorVentaEnTx(
  tx: Tx,
  tenantId: string,
  lineasIds: readonly string[],
  valor: { monto: number; porEspecie: LineaEspecie[] },
  comoElCargo: string | null,
): Promise<ValorVentaDeCubicacion> {
  const todas = await tx.forestCtpEntry.findMany({
    where: { tenantId, id: { in: [...lineasIds] }, section: "despacho", deletedAt: null, status: { not: "anulado" } },
    select: { id: true, speciesCommon: true, quantity: true, unit: true, valorVenta: true, moneda: true, entryDate: true, gtfNumber: true },
    orderBy: [{ entryDate: "asc" }, { lineNo: "asc" }],
  });
  const repartir = (ls: typeof todas) =>
    repartirValorVenta(
      valor.monto,
      ls.map((l) => ({
        id: l.id, especie: l.speciesCommon, cantidad: decimalONull(l.quantity), unidad: l.unit,
        valorVenta: decimalONull(l.valorVenta), moneda: l.moneda,
      })),
      valor.porEspecie,
    );
  /* «Ya tenía» y su diferencia se miden contra la guía ENTERA; el filtro sólo decide dónde se escribe. */
  const deTodas = repartir(todas);
  if (deTodas.estado !== "puesto") return { tipo: "valorVenta", ...deTodas };
  const lineas = comoElCargo == null ? todas : todas.filter((l) => l.gtfNumber?.trim() === comoElCargo.trim());
  const plan = lineas.length === todas.length ? deTodas : repartir(lineas);
  if (plan.estado !== "puesto") return { tipo: "valorVenta", ...plan };
  for (const l of lineas) {
    if (await ForestCtpCierreDB.closedPeriodOf(tenantId, l.entryDate)) return { tipo: "valorVenta", estado: "mes_cerrado", lineas: [], previo: null, diferencia: null };
  }
  const puestas: ValorVentaDeCubicacion["lineas"] = [];
  for (const l of plan.lineas) {
    const r = await tx.forestCtpEntry.updateMany({
      where: { id: l.despachoId, tenantId, section: "despacho", valorVenta: null, deletedAt: null },
      data: { valorVenta: new Prisma.Decimal(l.valor.toFixed(2)) },
    });
    if (r.count === 1) puestas.push(l);
  }
  return { tipo: "valorVenta", estado: "puesto", lineas: puestas, previo: null, diferencia: null };
}

/**
 * Al anular: vacía el valor de venta de cada línea SÓLO si sigue siendo el que
 * puso la cubicación (el valor en el WHERE). Mes cerrado no se toca. Devuelve
 * cuántas líneas vació y cuántas quedaron como estaban.
 */
async function vaciarValorVentaEnTx(tx: Tx, tenantId: string, v: ValorVentaDeCubicacion | null): Promise<{ vaciadas: number; quedaron: number }> {
  if (!v || v.estado !== "puesto" || v.lineas.length === 0) return { vaciadas: 0, quedaron: 0 };
  let vaciadas = 0;
  for (const l of v.lineas) {
    const fila = await tx.forestCtpEntry.findFirst({ where: { id: l.despachoId, tenantId }, select: { entryDate: true } });
    if (!fila || (await ForestCtpCierreDB.closedPeriodOf(tenantId, fila.entryDate))) continue;
    const r = await tx.forestCtpEntry.updateMany({
      where: { id: l.despachoId, tenantId, section: "despacho", valorVenta: new Prisma.Decimal(l.valor.toFixed(2)) },
      data: { valorVenta: null },
    });
    vaciadas += r.count;
  }
  return { vaciadas, quedaron: v.lineas.length - vaciadas };
}

/** El precio de un despacho es la madera vendida del resultado del negocio (ADR-451): sus cachés, como `setValorVenta`. */
function invalidarDespachos(tenantId: string): void {
  try {
    invalidateByPrefix(`forest-ctp:${tenantId}`);
    invalidateByPrefix(`${claveCacheResultado(tenantId)}:`);
  } catch (err) {
    logger.error("[forest-cubicacion-trozas] no se pudo invalidar la caché del despacho", { error: String(err), tenantId });
  }
}

/** El error de un descuento que no cuadra, como 422 `DESCUENTO_INVALIDO {troza|pieza|clave}`. */
export function comoErrorDeDescuento(err: unknown): unknown {
  return err instanceof DescuentoInvalidoError ? new CubicacionTrozasError("DESCUENTO_INVALIDO", err.message, { ...err.donde }) : err;
}

/** Sin madera que cobrar después de los descuentos: no se guarda (una cubicación en 0 no paga nada). */
export function exigirVolumenNeto(neto: number): void {
  if (!(neto > 0)) throw new CubicacionTrozasError("DESCUENTO_INVALIDO", "Con esos descuentos no queda madera que cobrar: revísalos.");
}

/** El bruto se guarda sólo si los descuentos lo bajaron (null = bruto igual al volumen). */
export const brutoSiCambio = (bruto: number, neto: number, f: FormulaComercial): Prisma.Decimal | null =>
  bruto - neto > 10 ** -decimalesDe(f) / 2 ? new Prisma.Decimal(bruto.toFixed(4)) : null;

/** Re-cubica con los descuentos de cada troza y del lote (ADR-483); sin descuentos, lo de ADR-478. */
function cubicar(input: GuardarCubicacionInput) {
  try {
    const r = cubicarTrozasComercial(input.formula, input.trozas, input.diametros, input.descuentos);
    exigirVolumenNeto(r.neto);
    return r;
  } catch (err) {
    if (err instanceof MedidaFueraDeRangoError) throw new CubicacionTrozasError("MEDIDA_FUERA_DE_RANGO", err.message, { troza: err.n });
    throw comoErrorDeDescuento(err);
  }
}

export async function exigirContrato(tenantId: string, contratoId: string | undefined): Promise<void> {
  if (!contratoId) return;
  const c = await prisma.forestContrato.findFirst({ where: { id: contratoId, tenantId, deletedAt: null }, select: { id: true } });
  if (!c) throw new CubicacionTrozasError("CONTRATO_NO_ENCONTRADO", "Ese permiso no existe en este negocio.");
}

/**
 * El N° de guía que se guarda: el del Libro CTP del negocio (`WoodEntry`), no
 * el texto tipeado. «10-1-5» y «010-001-0000005» son la misma guía
 * (`mismoNumeroGtf`), pero los frenos anti doble pago y el lock de la guía
 * comparan el texto: con el tipeado, la guía se pagaba otra vez por la plata
 * de la guía (revisión M, 08-10). En una COMPRA la guía tiene que estar en el
 * libro (422 `GUIA_NO_ENCONTRADA`); en una VENTA la guía es de salida y puede
 * no tener ingreso: queda como se escribió.
 */
async function guiaCanonica(tenantId: string, sentido: "compra" | "venta", gtf: string | undefined): Promise<string | null> {
  const texto = gtf?.trim();
  if (!texto) return null;
  const delLibro = await numeroDelLibroCtp(tenantId, texto);
  if (delLibro) return delLibro;
  if (sentido === "venta") return texto;
  throw new CubicacionTrozasError(
    "GUIA_NO_ENCONTRADA",
    `La guía ${texto} no está en el Libro CTP de este negocio: revisa el número o regístrala primero. Si la madera no vino con guía, deja el campo vacío.`,
  );
}

/** El N° de la guía como está en el Libro CTP (`WoodEntry` vivo), o null si no está. */
export async function numeroDelLibroCtp(tenantId: string, texto: string): Promise<string | null> {
  const filtro = filtroMismaGuia(texto);
  if (!filtro) return null;
  const filas = await prisma.woodEntry.findMany({
    where: { tenantId, gtfNumber: filtro, deletedAt: null, status: { notIn: [...ESTADOS_GUIA_MUERTA] } },
    select: { gtfNumber: true },
    orderBy: [{ entryDate: "asc" }, { id: "asc" }],
    take: 500,
  });
  return filas.find((f) => mismoNumeroGtf(f.gtfNumber, texto))?.gtfNumber.trim() ?? null;
}

/**
 * La GTF del Libro TH de ESTE negocio (ADR-483): otra, borrada o de otro
 * negocio = 404 `ORIGEN_NO_ENCONTRADO`; anulada = 422 `GUIA_ANULADA`; de
 * productos (no de trozas) = 404 (no hay trozas que cubicar).
 */
export async function lothDelTenant(db: Db, tenantId: string, id: string | null | undefined) {
  const gtf = id
    ? await db.forestGtf.findFirst({
        where: { id, tenantId, deletedAt: null },
        select: {
          id: true, gtfNumber: true, gtfDate: true, tipo: true, status: true, titularName: true,
          tituloHabilitante: true, volumenTotalM3: true, items: true,
        },
      })
    : null;
  if (!gtf) throw new CubicacionTrozasError("ORIGEN_NO_ENCONTRADO", "Esa guía no está en el Libro TH de este negocio.");
  if (gtf.status === "anulada") {
    throw new CubicacionTrozasError("GUIA_ANULADA", `La guía ${gtf.gtfNumber} está anulada: cubica la que la reemplazó.`);
  }
  if (gtf.tipo !== "trozas") {
    throw new CubicacionTrozasError("ORIGEN_NO_ENCONTRADO", `La guía ${gtf.gtfNumber} es de productos, no de trozas: no se cubica troza por troza.`);
  }
  return gtf;
}

/** El despacho del Libro CTP de ESTE negocio, vivo (ADR-483): si no, 404 `ORIGEN_NO_ENCONTRADO`. */
export async function despachoDelTenant(db: Db, tenantId: string, id: string | null | undefined) {
  const d = id
    ? await db.forestCtpEntry.findFirst({
        where: { id, tenantId, section: "despacho", deletedAt: null, status: { not: "anulado" } },
        select: {
          id: true, gtfNumber: true, entryDate: true, speciesCommon: true, quantity: true, unit: true, pieces: true,
          valorVenta: true, destino: true, gtfDatos: true,
        },
      })
    : null;
  if (!d) throw new CubicacionTrozasError("ORIGEN_NO_ENCONTRADO", "Ese despacho no está en el Libro CTP de este negocio, o está anulado.");
  return d;
}

/** Item de la GTF del LO-TH tal como se guarda (`GtfItem`, lib/db/forest-gtf.db.ts). */
interface ItemGtf {
  code?: string | null;
  codigoGuia?: string | null;
  volumeM3?: number | null;
}
const claveCodigo = (c: string | null | undefined) => (c ?? "").trim().toUpperCase();

/** El m³ que la GTF declara para cada código de troza (el único y el impreso), para `m3Guia`. */
export function m3PorCodigoDeGuia(items: Prisma.JsonValue | null): Map<string, number> {
  const out = new Map<string, number>();
  for (const it of arr<ItemGtf>(items) ?? []) {
    const v = typeof it.volumeM3 === "number" && Number.isFinite(it.volumeM3) && it.volumeM3 > 0 ? it.volumeM3 : null;
    if (v == null) continue;
    for (const c of [claveCodigo(it.code), claveCodigo(it.codigoGuia)]) if (c && !out.has(c)) out.set(c, v);
  }
  return out;
}

/**
 * De dónde sale la guía de una cubicación de TROZAS (ADR-483 D3):
 *   - `loth`: la GTF del Libro TH (validada del negocio y viva). El N° es el del
 *     Libro CTP si la guía ya ingresó (así los frenos de doble pago la ven como
 *     la misma), y si no, el de la GTF: **no** se exige que esté en `WoodEntry`.
 *     El texto de guía del cuerpo se ignora.
 *   - sin origen, `libre` o `ctp`: como ADR-478 (`guiaCanonica`).
 */
async function guiaDelOrigen(
  tenantId: string,
  input: { origen?: "libre" | "ctp" | "loth"; origenId?: string; sentido: "compra" | "venta"; gtfNumber?: string },
): Promise<{ gtfNumber: string | null; origen: OrigenCubicacion | null; origenId: string | null; referenciaSmalianM3: Prisma.Decimal | null; m3PorCodigo: Map<string, number> }> {
  if (input.origen !== "loth") {
    return {
      gtfNumber: await guiaCanonica(tenantId, input.sentido, input.gtfNumber),
      origen: input.origen ?? null,
      origenId: null,
      referenciaSmalianM3: null,
      m3PorCodigo: new Map(),
    };
  }
  const gtf = await lothDelTenant(prisma, tenantId, input.origenId);
  return {
    gtfNumber: (await numeroDelLibroCtp(tenantId, gtf.gtfNumber)) ?? gtf.gtfNumber.trim(),
    origen: "loth",
    origenId: gtf.id,
    referenciaSmalianM3: gtf.volumenTotalM3,
    m3PorCodigo: m3PorCodigoDeGuia(gtf.items),
  };
}

/** Lo que una troza de la guía declara (SERFOR), pegado a la troza con el mismo código. */
function conM3DeGuia(trozas: TrozaCongelada[], m3PorCodigo: ReadonlyMap<string, number>): TrozaCongelada[] {
  if (m3PorCodigo.size === 0) return trozas;
  return trozas.map((t) => {
    const m3 = t.codigo ? m3PorCodigo.get(claveCodigo(t.codigo)) : undefined;
    return m3 != null ? { ...t, m3Guia: m3 } : t;
  });
}

/**
 * La fila manda el ORIGEN, como manda el material: un borrador ligado a una
 * GTF del Libro TH o a un despacho no se suelta al corregirlo (si no, queda
 * «libre» y sin frenos). Devuelve el `origenId` de la fila para heredarlo
 * cuando el cuerpo no trae origen; otro origen u otro id → 409 `ORIGEN_DISTINTO`.
 */
export async function origenDeLaFila(
  tenantId: string,
  id: string,
  ligado: "loth" | "despacho",
  cuerpo: { origen?: string; origenId?: string },
): Promise<string | null> {
  /* Aplicada o anulada: no se mira acá, la corrección responde YA_APLICADA / ANULADA. */
  const fila = await prisma.forestCubicacionTrozas.findFirst({
    where: { id, tenantId, deletedAt: null, estado: "borrador" },
    select: { codigo: true, origen: true, origenId: true },
  });
  if (!fila || fila.origen !== ligado || !fila.origenId) return null;
  if (cuerpo.origen === undefined || (cuerpo.origen === ligado && cuerpo.origenId === fila.origenId)) return fila.origenId;
  const de = ligado === "loth" ? "una GTF del Libro TH" : "un despacho del Libro CTP";
  throw new CubicacionTrozasError("ORIGEN_DISTINTO", `${fila.codigo} se hizo desde ${de}: no se cambia de origen. Haz otra cubicación.`);
}

/** La GTF de salida que el despacho tiene HOY (se emite después de guardar la cubicación), sin lanzar si ya no está. */
async function guiaActualDelDespacho(tx: Tx, tenantId: string, id: string): Promise<string | null> {
  const d = await tx.forestCtpEntry.findFirst({
    where: { id, tenantId, section: "despacho", deletedAt: null, status: { not: "anulado" } },
    select: { gtfNumber: true },
  });
  return d?.gtfNumber?.trim() || null;
}

/** El N° de una guía de venta como lo escribe su despacho (si la guía tiene uno), o como vino: el resultado del negocio junta la cuenta y el despacho por ese texto. */
async function guiaComoEnElDespacho(tx: Tx, tenantId: string, gtf: string | null): Promise<string | null> {
  const texto = gtf?.trim();
  if (!texto) return null;
  return (await despachosDeLaGuiaDeSalida(tx, tenantId, texto))[0]?.gtfNumber ?? texto;
}

/**
 * Las líneas de despacho vivas con esa GTF de salida (la cola del N° y
 * `mismoNumeroGtf`, como el prellenado): la guía puede juntar varias líneas
 * (`mismaGuiaQue`) y la cubicación de una cobra la madera de todas.
 */
export async function lineasDeLaGuiaDeSalida(db: Db, tenantId: string, gtf: string, paraElFreno = false): Promise<string[]> {
  return (await despachosDeLaGuiaDeSalida(db, tenantId, gtf, paraElFreno)).map((f) => f.id);
}

/** Lo que «aplicar» bloqueó del despacho antes de leer la fila: su guía de hoy y sus líneas (ordenadas). */
interface DespachoBloqueado {
  guia: string | null;
  lineas: string[];
}

/**
 * Un despacho, una sola cubicación aplicada (ADR-483 D8), y el origen sigue
 * vivo al cobrarse: bajo los locks `cub:{tenant}:despacho:{id}` de TODAS las
 * líneas de su guía de hoy, que toma «aplicar». Otra aplicada sobre cualquiera
 * de ellas = 409 (aunque se guardó cuando la línea aún no tenía guía); si la
 * guía o sus líneas cambiaron después de bloquear, 409 `DESACTUALIZADA`.
 */
async function exigirOrigenVivo(
  tx: Tx,
  tenantId: string,
  cub: { id: string; codigo: string; origen: string | null; origenId: string | null },
  bloqueado: DespachoBloqueado | null,
): Promise<void> {
  if (cub.origen === "loth") await lothDelTenant(tx, tenantId, cub.origenId);
  if (cub.origen !== "despacho" || !cub.origenId) return;
  const d = await despachoDelTenant(tx, tenantId, cub.origenId);
  const guia = d.gtfNumber?.trim() || null;
  const lineas = guia ? await lineasDeLaGuiaDeSalida(tx, tenantId, guia) : [];
  if (!bloqueado || guia !== bloqueado.guia || lineas.some((l) => !bloqueado.lineas.includes(l))) {
    throw new CubicacionTrozasError("DESACTUALIZADA", `Al despacho de ${cub.codigo} le cambiaron la guía mientras cobrabas: vuelve a intentarlo.`);
  }
  const otra = await tx.forestCubicacionTrozas.findFirst({
    where: { tenantId, origen: "despacho", origenId: { in: [...new Set([cub.origenId, ...lineas])] }, estado: "aplicada", deletedAt: null, NOT: { id: cub.id } },
    select: { codigo: true },
  });
  if (otra) {
    throw new CubicacionTrozasError("DESPACHO_YA_VALORIZADO", `Ese despacho ya se cobró con la cubicación ${otra.codigo}: anúlala si quieres hacerla de nuevo.`, {
      codigo: otra.codigo,
    });
  }
}

/**
 * Los locks de «aplicar» que van DESPUÉS de los de la guía (ADR-483 §7):
 * despacho → cubicación del Cubicador. Con origen despacho bloquea TODAS las
 * líneas de su guía de hoy, en orden de id (sin orden, dos cobros se abrazan
 * en deadlock).
 */
async function bloquearDespachoYRefEnTx(
  tx: Tx,
  tenantId: string,
  previa: { origen: string | null; origenId: string | null; cubicacionRefId: string | null },
  guiaHoy: string | null,
): Promise<DespachoBloqueado | null> {
  let despacho: DespachoBloqueado | null = null;
  if (previa.origen === "despacho" && previa.origenId) {
    const lineas = await bloquearLineasDeDespachoEnTx(tx, tenantId, [previa.origenId, ...(guiaHoy ? await lineasDeLaGuiaDeSalida(tx, tenantId, guiaHoy) : [])]);
    despacho = { guia: guiaHoy, lineas };
  }
  if (previa.cubicacionRefId) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`cub:${tenantId}:ref:${previa.cubicacionRefId}`}))`;
  return despacho;
}

/**
 * Una cubicación guardada del Cubicador de madera se cobra una vez POR
 * SENTIDO: «uno por uno» copia todas sus piezas, así que dos aplicadas del
 * mismo sentido cobran el mismo lote dos veces. Comprarlo y después venderlo
 * sigue valiendo. Bajo el lock `cub:{tenant}:ref:{id}`.
 */
async function exigirRefSinCobrar(tx: Tx, tenantId: string, cub: { id: string; cubicacionRefId: string | null; sentido: string }): Promise<void> {
  if (!cub.cubicacionRefId) return;
  const otra = await tx.forestCubicacionTrozas.findFirst({
    where: { tenantId, cubicacionRefId: cub.cubicacionRefId, sentido: cub.sentido, estado: "aplicada", deletedAt: null, NOT: { id: cub.id } },
    select: { codigo: true },
  });
  if (otra) {
    throw new CubicacionTrozasError(
      "REF_YA_VALORIZADA",
      `Esas piezas del Cubicador de madera ya se ${cub.sentido === "venta" ? "vendieron" : "compraron"} con ${otra.codigo}: anúlala si quieres cobrarlas de nuevo.`,
      { codigo: otra.codigo },
    );
  }
}

/** Una guía, una sola plata (§6): ni abono `madera`, ni costo, ni otra cubicación aplicada. Bajo el lock de la guía; compara con `puedeSerLaMismaGtf` (la regla del candado). */
async function exigirGuiaSinPlata(tx: Tx, tenantId: string, gtf: string, id: string): Promise<void> {
  const filtro = filtroMismaGuia(gtf) ?? gtf;
  const esLaGuia = (f: { gtfNumber: string | null }) => f.gtfNumber === gtf || puedeSerLaMismaGtf(f.gtfNumber, gtf);
  const abonos = await tx.forestCuentaMov.findMany({ where: { tenantId, gtfNumber: filtro, concepto: "madera", deletedAt: null }, select: { gtfNumber: true }, take: 500 });
  let pagada = abonos.some(esLaGuia);
  if (!pagada) {
    const costos = await tx.woodEntry.findMany({
      where: { tenantId, gtfNumber: filtro, deletedAt: null, costoTotal: { not: null }, status: { notIn: [...ESTADOS_GUIA_MUERTA] } },
      select: { gtfNumber: true },
      take: 500,
    });
    pagada = costos.some(esLaGuia);
  }
  if (pagada) {
    throw new CubicacionTrozasError("GUIA_YA_VALORIZADA", `La madera de la guía ${gtf} ya tiene su costo o su pago anotado: no se puede pagar otra vez con la cubicación.`);
  }
  const otra = await cubicacionQuePagoLaGuia(tx, tenantId, gtf, id);
  if (otra) throw new CubicacionTrozasError("GUIA_YA_VALORIZADA", `La guía ${gtf} ya se pagó con la cubicación ${otra.codigo}.`);
}

export function auditar(action: CtpAuditAction, tenantId: string, row: RowResumen, actor: ActorCubicacion, extra: string) {
  const formula = formulaDe(row.formula);
  const cuenta = materialDe(row.material) === "aserrada" ? `aserrada · ${row.nTrozas} piezas` : `${row.nTrozas} trozas`;
  const detail = [
    row.codigo,
    row.personaNombre ?? "sin persona",
    `${cuenta} · ${fmtVolumen(Number(row.volumen), formula)}`,
    row.volumenBruto != null ? `bruto ${fmtVolumen(Number(row.volumenBruto), formula)}` : null,
    row.monto != null ? `S/ ${Number(row.monto).toFixed(2)}` : null,
    row.gtfNumber ? `guía ${row.gtfNumber}` : null,
    row.origen === "loth" || row.origen === "despacho" ? `de ${row.origen === "loth" ? "la GTF del Libro TH" : "el despacho"} ${row.origenId ?? ""}`.trim() : null,
    extra || null,
    actor.ip ? `IP ${actor.ip}` : null,
  ].filter(Boolean).join(" · ");
  return { tenantId, action, entity: "ForestCubicacionTrozas" as const, entityId: row.id, detail, user: actor.usuario || "unknown" };
}

const textoImputacion = (imp: readonly ImputacionGuardada[]) =>
  imp.map((i) => `${i.codigoOperacion ?? i.adelantoId}: S/ ${i.monto.toFixed(2)}${i.excedido ? " (excedido)" : ""}`).join("; ");

export const ForestCubicacionTrozasDB = {
  /** Sin `material` = sólo trozas (Herramientas y Cuenta no cambian, ADR-483 D12); `todas` trae también la aserrada. */
  async list(
    tenantId: string,
    filtros: {
      beneficiarioId?: string;
      parteId?: string;
      estado?: EstadoCubicacion;
      material?: MaterialCubicacion | "todas";
      origen?: OrigenCubicacion;
      origenId?: string;
    } = {},
  ): Promise<CubicacionTrozasResumen[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const material = filtros.material ?? "troza";
    const clave = [
      `${CACHE}:${tenantId}:list`, filtros.beneficiarioId ?? "", filtros.parteId ?? "", filtros.estado ?? "",
      material, filtros.origen ?? "", filtros.origenId ?? "",
    ].join(":");
    return getOrSet(clave, 20, async () => {
      const rows = await prisma.forestCubicacionTrozas.findMany({
        where: {
          tenantId, deletedAt: null,
          ...(filtros.beneficiarioId ? { beneficiarioId: filtros.beneficiarioId } : {}),
          ...(filtros.parteId ? { parteId: filtros.parteId } : {}),
          ...(filtros.estado ? { estado: filtros.estado } : {}),
          ...(material === "todas" ? {} : { material }),
          ...(filtros.origen ? { origen: filtros.origen } : {}),
          ...(filtros.origenId ? { origenId: filtros.origenId } : {}),
        },
        select: SELECT_RESUMEN,
        orderBy: [{ fecha: "desc" }, { createdAt: "desc" }],
        take: 200,
      });
      return rows.map(aResumen);
    });
  },

  async get(tenantId: string, id: string): Promise<CubicacionTrozasDTO | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const row = await prisma.forestCubicacionTrozas.findFirst({ where: { id, tenantId, deletedAt: null } });
    return row ? aDTO(row) : null;
  },

  /**
   * Para «Valorizar y descontar»: la cubicación, los adelantos a los que iría
   * (FIFO, misma consulta que `aplicar`), el último precio por especie que se
   * le aplicó a esta persona con la misma fórmula (R10) y su cuenta forestal
   * con el saldo de hoy (ADR-484: adonde va lo que el adelanto no cubre).
   */
  async detalle(tenantId: string, id: string) {
    if (!tenantId) throw new Error("tenantId is required");
    const row = await prisma.forestCubicacionTrozas.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!row) return null;
    const cubicacion = aDTO(row);
    const beneficiarioId = await beneficiarioDe(prisma, tenantId, row);
    const adelantosAbiertos = beneficiarioId ? await abiertosDe(prisma, tenantId, beneficiarioId, direccionDelSentido(cubicacion.sentido)) : [];
    const persona = row.beneficiarioId ? { beneficiarioId: row.beneficiarioId } : row.parteId ? { parteId: row.parteId } : null;
    const ultimosPrecios: Record<string, number> = {};
    if (persona) {
      const previas = await prisma.forestCubicacionTrozas.findMany({
        where: { tenantId, ...persona, formula: row.formula, estado: "aplicada", deletedAt: null, NOT: { id } },
        select: { porEspecie: true },
        orderBy: { aplicadaAt: "desc" },
        take: 20,
      });
      for (const p of previas) {
        for (const l of arr<LineaEspecie>(p.porEspecie) ?? []) {
          if (l.precio != null && !(l.clave in ultimosPrecios)) ultimosPrecios[l.clave] = l.precio;
        }
      }
    }
    /* ADR-484: la cuenta forestal a la que iría lo que el adelanto no cubre (null = no tiene ficha o la cuenta está apagada). */
    const [parte, cuentaForestal] = await Promise.all([parteDe(prisma, tenantId, row), isSpecializationEnabled(tenantId, "spec:forestal:ctp-libro")]);
    const cuenta = parte && cuentaForestal
      ? { parteId: parte.id, nombre: parte.nombre, saldo: await ForestCuentaDB.saldoDeParteEnTx(prisma, tenantId, parte.id) }
      : null;
    return { cubicacion, adelantosAbiertos, ultimosPrecios, cuenta, cuentaForestal };
  },

  /** Alta de un borrador: re-cubica, toma el siguiente «CUB-AAAA-NNNN» bajo un lock del negocio. */
  async guardar(tenantId: string, input: GuardarCubicacionInput, actor: ActorCubicacion): Promise<CubicacionTrozasDTO> {
    if (!tenantId) throw new Error("tenantId is required");
    const persona = await resolverPersona(prisma, tenantId, input);
    await exigirContrato(tenantId, input.contratoId);
    const guia = await guiaDelOrigen(tenantId, input);
    const c = cubicar(input);
    const trozas = conM3DeGuia(c.trozas, guia.m3PorCodigo);
    const row = await crearConCodigo(tenantId, input.fecha, {
      fecha: new Date(`${input.fecha}T00:00:00.000Z`),
      formula: input.formula,
      diametros: input.diametros,
      beneficiarioId: persona.beneficiarioId,
      parteId: persona.parteId,
      personaNombre: persona.nombre,
      sentido: input.sentido,
      gtfNumber: guia.gtfNumber,
      contratoId: input.contratoId || null,
      material: "troza",
      modo: "pieza",
      origen: guia.origen,
      origenId: guia.origenId,
      referenciaSmalianM3: guia.referenciaSmalianM3,
      descuentos: input.descuentos ? (input.descuentos as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
      volumenBruto: brutoSiCambio(c.bruto, c.neto, input.formula),
      trozas: trozas as unknown as Prisma.InputJsonValue,
      nTrozas: trozas.length,
      volumen: new Prisma.Decimal(c.neto.toFixed(4)),
      notas: input.notas || null,
      createdBy: actor.usuario || "unknown",
    });
    invalidar(tenantId);
    auditCtp(auditar("ctp_cubicacion_trozas_guardar", tenantId, row, actor, "borrador nuevo"));
    return aDTO(row);
  },

  /** Corrige un BORRADOR con la versión que se leyó. Aplicada o anulada no se edita. */
  async editar(tenantId: string, id: string, cuerpo: EditarCubicacionInput, actor: ActorCubicacion): Promise<CubicacionTrozasDTO> {
    if (!tenantId) throw new Error("tenantId is required");
    /* Corregir desde Herramientas no manda el origen: se hereda el de la fila (409 si trae otro). */
    const ligadaA = await origenDeLaFila(tenantId, id, "loth", cuerpo);
    const input: EditarCubicacionInput = ligadaA ? { ...cuerpo, origen: "loth", origenId: ligadaA } : cuerpo;
    const persona = await resolverPersona(prisma, tenantId, input);
    await exigirContrato(tenantId, input.contratoId);
    const guia = await guiaDelOrigen(tenantId, input);
    const c = cubicar(input);
    const trozas = conM3DeGuia(c.trozas, guia.m3PorCodigo);
    const res = await prisma.forestCubicacionTrozas.updateMany({
      /* La fila manda el material: una de aserrada no se pisa con trozas (409 `MATERIAL_DISTINTO`). */
      where: { id, tenantId, estado: "borrador", version: input.version, deletedAt: null, material: "troza" },
      data: {
        fecha: new Date(`${input.fecha}T00:00:00.000Z`),
        formula: input.formula,
        diametros: input.diametros,
        beneficiarioId: persona.beneficiarioId,
        parteId: persona.parteId,
        personaNombre: persona.nombre,
        sentido: input.sentido,
        gtfNumber: guia.gtfNumber,
        contratoId: input.contratoId || null,
        origen: guia.origen,
        origenId: guia.origenId,
        referenciaSmalianM3: guia.referenciaSmalianM3,
        descuentos: input.descuentos ? (input.descuentos as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
        volumenBruto: brutoSiCambio(c.bruto, c.neto, input.formula),
        trozas: trozas as unknown as Prisma.InputJsonValue,
        nTrozas: trozas.length,
        volumen: new Prisma.Decimal(c.neto.toFixed(4)),
        notas: input.notas || null,
        version: { increment: 1 },
      },
    });
    if (res.count === 0) await explicarNoEditable(tenantId, id, "troza");
    const row = await prisma.forestCubicacionTrozas.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!row) throw new CubicacionTrozasError("NO_ENCONTRADA", "Esa cubicación no existe.");
    invalidar(tenantId);
    auditCtp(auditar("ctp_cubicacion_trozas_guardar", tenantId, row, actor, `corregida (versión ${row.version})`));
    return aDTO(row);
  },

  /** Sólo un borrador; baja lógica (el código no se vuelve a usar). */
  async borrar(tenantId: string, id: string, actor: ActorCubicacion): Promise<void> {
    if (!tenantId) throw new Error("tenantId is required");
    const res = await prisma.forestCubicacionTrozas.updateMany({
      where: { id, tenantId, estado: "borrador", deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (res.count === 0) await explicarNoEditable(tenantId, id);
    const row = await prisma.forestCubicacionTrozas.findFirst({ where: { id, tenantId }, select: SELECT_RESUMEN });
    invalidar(tenantId);
    if (row) auditCtp(auditar("ctp_cubicacion_trozas_borrar", tenantId, row, actor, "borrador borrado"));
  },

  /**
   * Valoriza en el servidor y descuenta de los adelantos de la persona, en UNA
   * transacción. Lo que los adelantos no cubren —todo, si no tiene— va a su
   * cuenta forestal (ADR-484: venta → te debe; compra → le debes), y una venta
   * de un despacho llena su valor de venta si estaba vacío. El reintento con la
   * misma clave y el mismo cuerpo devuelve lo aplicado (`repetido`); con otro
   * cuerpo, 422.
   */
  async aplicar(
    tenantId: string,
    id: string,
    input: AplicarCubicacionInput,
    actor: ActorCubicacion,
  ): Promise<{ cubicacion: CubicacionTrozasDTO; imputacion: ImputacionGuardada[]; repetido: boolean }> {
    if (!tenantId) throw new Error("tenantId is required");
    const huella = huellaAplicar(input);
    const clave = input.idempotencyKey.trim();
    /* La cuenta forestal vive con el Libro CTP: apagado, el resto no tiene dónde quedar (SIN_CUENTA). */
    const cuentaForestal = await isSpecializationEnabled(tenantId, "spec:forestal:ctp-libro");
    const escribir = () =>
      prisma.$transaction(async (tx) => {
        const previa = await tx.forestCubicacionTrozas.findFirst({
          where: { id, tenantId, deletedAt: null },
          select: { gtfNumber: true, beneficiarioId: true, parteId: true, origen: true, origenId: true, cubicacionRefId: true },
        });
        if (!previa) throw new CubicacionTrozasError("NO_ENCONTRADA", "Esa cubicación no existe.");
        /* Orden de locks: guía → despacho → cubicación del Cubicador → persona (adelantos → cuenta forestal) → fila → adelantos (ADR-483 §7, ADR-484).
           Con origen despacho manda también la guía de HOY: la GTF de salida se emite después de guardar y junta líneas. */
        const guiaHoy = previa.origen === "despacho" && previa.origenId ? await guiaActualDelDespacho(tx, tenantId, previa.origenId) : null;
        const guias = [...new Set([previa.gtfNumber, guiaHoy].filter((g): g is string => Boolean(g)))];
        if (guias.length) await ForestCuentaDB.bloquearGuiasEnTx(tx, tenantId, guias);
        const despacho = await bloquearDespachoYRefEnTx(tx, tenantId, previa, guiaHoy);
        const beneficiarioId = await beneficiarioDe(tx, tenantId, previa);
        if (beneficiarioId) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`liq:${tenantId}:benef:${beneficiarioId}`}))`;
        const parte = await parteDe(tx, tenantId, previa);
        if (parte) await ForestCuentaDB.bloquearPartesEnTx(tx, tenantId, [parte.id]);
        await tx.$queryRaw`SELECT "id" FROM "ForestCubicacionTrozas" WHERE "id" = ${id} AND "tenantId" = ${tenantId} FOR UPDATE`;
        const cub = await tx.forestCubicacionTrozas.findFirst({ where: { id, tenantId, deletedAt: null } });
        if (!cub) throw new CubicacionTrozasError("NO_ENCONTRADA", "Esa cubicación no existe.");

        if (cub.estado === "aplicada") {
          if (cub.idempotencyKey === clave) {
            if (cub.idempotencyHuella !== huella) {
              throw new CubicacionTrozasError("IDEMPOTENCIA_DISTINTA", `${cub.codigo} ya se aplicó con otros precios en este intento: vuelve a abrirla.`);
            }
            return { repetido: true as const, row: cub };
          }
          throw new CubicacionTrozasError("YA_APLICADA", `${cub.codigo} ya está aplicada a la cuenta. Para cambiarla, anúlala y hazla de nuevo.`);
        }
        if (cub.estado === "anulada") throw new CubicacionTrozasError("ANULADA", `${cub.codigo} está anulada: guárdala de nuevo para aplicarla.`);
        const cambioDueno =
          cub.gtfNumber !== previa.gtfNumber || cub.beneficiarioId !== previa.beneficiarioId || cub.parteId !== previa.parteId ||
          cub.origen !== previa.origen || cub.origenId !== previa.origenId || cub.cubicacionRefId !== previa.cubicacionRefId;
        /* La ficha de adelantos pudo vincularse a otra parte del directorio mientras tanto: el candado tomado sería el de otra cuenta. */
        const otraCuenta = (await parteDe(tx, tenantId, cub))?.id !== parte?.id;
        if (cub.version !== input.version || cambioDueno || otraCuenta) {
          throw new CubicacionTrozasError("DESACTUALIZADA", `Alguien cambió ${cub.codigo} mientras la mirabas: vuelve a abrirla.`, { version: cub.version });
        }
        if ((cub.moneda || "PEN").toUpperCase() !== "PEN") {
          throw new CubicacionTrozasError("MONEDA_NO_SOPORTADA", `${cub.codigo} no está en soles: la cuenta y los adelantos de madera se llevan sólo en soles.`);
        }
        const otraConClave = await tx.forestCubicacionTrozas.findFirst({ where: { tenantId, idempotencyKey: clave, NOT: { id } }, select: { codigo: true } });
        if (otraConClave) throw new CubicacionTrozasError("IDEMPOTENCIA_DISTINTA", `Esa clave ya se usó para ${otraConClave.codigo}: vuelve a abrir la cubicación.`);
        if (cub.gtfNumber) await exigirGuiaSinPlata(tx, tenantId, cub.gtfNumber, id);
        /* La guía que el despacho recibió DESPUÉS de guardar también frena (D8). */
        if (guiaHoy && !(cub.gtfNumber && (cub.gtfNumber === guiaHoy || mismoNumeroGtf(cub.gtfNumber, guiaHoy)))) {
          await exigirGuiaSinPlata(tx, tenantId, guiaHoy, id);
        }
        const venta = cub.sentido === "venta";
        if (venta && guias.length) await exigirVentaSinAnotar(tx, tenantId, guias);
        /* Una venta suelta con la guía de un despacho que ya se cobró desde el despacho (guardada cuando aún no tenía guía). */
        if (venta && cub.origen !== "despacho") {
          for (const g of guias) {
            const otra = await cubicacionQueVendioLaGuia(tx, tenantId, g, await lineasDeLaGuiaDeSalida(tx, tenantId, g, true), id);
            if (otra) throw new CubicacionTrozasError("DESPACHO_YA_VALORIZADO", `La venta de la guía ${g} ya se cobró con la cubicación ${otra.codigo}: anúlala si quieres hacerla de nuevo.`, { codigo: otra.codigo });
          }
        }
        await exigirOrigenVivo(tx, tenantId, cub, despacho);
        await exigirRefSinCobrar(tx, tenantId, cub);

        /* La fórmula de la fila tal cual: tablar se cobra por PT, nunca como m³ (ADR-483). */
        const formula = formulaDe(cub.formula);
        const material = materialDe(cub.material);
        let valor: ReturnType<typeof valorizar>;
        try {
          const lineas = lineasDeEspecie({ material, modo: cub.modo === "total" ? "total" : "pieza", formula, trozas: arr<unknown>(cub.trozas) ?? [] });
          valor = valorizar(aplicarDescuentoLote(lineas, descuentosDe(cub.descuentos), formula).lineas, input.precios, input.precioGeneral);
        } catch (err) {
          if (err instanceof FaltaPrecioError) throw new CubicacionTrozasError("FALTA_PRECIO", err.message, { especie: err.especie });
          throw comoErrorDeDescuento(err);
        }
        if (!(valor.monto >= 0.01)) throw new CubicacionTrozasError("MONTO_CERO", "Con esos precios la madera vale S/ 0,00: revisa los precios.");
        if (Math.abs(valor.monto - input.montoVisto) > 0.005) {
          throw new CubicacionTrozasError("MONTO_CAMBIO", `El monto es S/ ${valor.monto.toFixed(2)}, no S/ ${input.montoVisto.toFixed(2)}: revisa la tabla antes de confirmar.`, {
            monto: valor.monto,
            porEspecie: valor.porEspecie,
          });
        }

        const direccion = direccionDelSentido(venta ? "venta" : "compra");
        const pedidos = input.adelantoIds ? [...new Set(input.adelantoIds)] : undefined;
        const candidatos = beneficiarioId ? await abiertosDe(tx, tenantId, beneficiarioId, direccion, pedidos) : [];
        if (pedidos && candidatos.length !== pedidos.length) {
          throw new CubicacionTrozasError(
            "ADELANTO_NO_VALIDO",
            "Uno de los adelantos elegidos ya no está abierto, no es de esta persona, no es en soles o tiene cuotas pactadas: vuelve a abrir la cubicación.",
          );
        }
        const ids = candidatos.map((a) => a.id).sort();
        if (ids.length > 0) {
          await tx.$queryRaw`SELECT "id" FROM "Adelanto" WHERE "tenantId" = ${tenantId} AND "id" = ANY(${ids}::text[]) ORDER BY "id" FOR UPDATE`;
        }
        /* Los saldos, releídos BAJO el lock: lo que se reparte es lo que hay. */
        const abiertos = ids.length > 0 && beneficiarioId ? await abiertosDe(tx, tenantId, beneficiarioId, direccion, ids) : [];
        const { partes, aCuenta } = repartirConCuenta(valor.monto, Number(cub.volumen), abiertos, decimalesDe(formula));
        if (aCuenta && (!parte || !cuentaForestal)) {
          throw new CubicacionTrozasError("SIN_CUENTA", mensajeSinCuenta(cub.personaNombre, aCuenta.monto, cuentaForestal ? "sin_parte" : "apagada"), {
            resto: aCuenta.monto,
          });
        }

        const fecha = fechaEntrega(cub.fecha.toISOString().slice(0, 10));
        const detalle = descripcionEntregaMadera({ codigo: cub.codigo, nTrozas: cub.nTrozas, volumen: Number(cub.volumen), formula, material });
        const imputacion: ImputacionGuardada[] = [];
        for (const [i, p] of partes.entries()) {
          const r = await AdelantosDB.registrarEntregaEnTx(tx, tenantId, p.adelantoId, {
            tipo: "LIBRE",
            valorManual: p.monto,
            cantidad: Math.round(p.volumen * 1000) / 1000,
            descripcion: descripcionEntregaMadera(
              { codigo: cub.codigo, nTrozas: cub.nTrozas, volumen: Number(cub.volumen), formula, material },
              { i: i + 1, de: partes.length },
            ),
            fecha,
            idempotencyKey: `${clave}:${p.adelantoId}`,
            cubicacionId: id,
          });
          if (!r || r.repetido || Math.abs(r.valor - p.monto) > 0.005) {
            throw new CubicacionTrozasError("IDEMPOTENCIA_DISTINTA", "La entrega de un adelanto no salió como se calculó: vuelve a abrir la cubicación.");
          }
          imputacion.push({ ...p, entregaId: r.entregaId });
        }

        /* ADR-484 (1): el resto, a su cuenta. La venta lleva la guía (así el resultado del negocio la cuenta una vez, ADR-451);
           la compra, no: el abono `madera` CON guía es el de «¿Cuánto pagaste?» (ADR-437) y tiene su índice único.
           La guía con el texto del despacho, que es como la agrupa el resultado: de un despacho, la que tiene HOY. */
        const guia = venta ? (cub.origen === "despacho" ? guiaHoy : await guiaComoEnElDespacho(tx, tenantId, cub.gtfNumber)) : null;
        let cuenta: CuentaDeCubicacion | null = null;
        if (aCuenta && parte) {
          const sentido = venta ? "venta" : "compra";
          const movIds = await ForestCuentaDB.crearDeCubicacionEnTx(
            tx,
            tenantId,
            {
              /* Sin guía, la venta no lleva referencia: el resultado del negocio la mostraría como una «guía CUB-…». */
              parteId: parte.id, parteNombre: parte.nombre, fecha: cub.fecha, referencia: venta ? guia : cub.codigo,
              gtfNumber: venta ? guia : null, contratoId: cub.contratoId, createdBy: actor.usuario,
            },
            patasDeCuenta({
              sentido, total: valor.monto, resto: aCuenta.monto, codigo: cub.codigo, detalle,
              adelantos: partes.map((p) => p.codigoOperacion ?? "su adelanto"),
            }),
          );
          cuenta = { tipo: "cuenta", parteId: parte.id, parteNombre: parte.nombre, monto: aCuenta.monto, volumen: aCuenta.volumen, sentido, movIds };
        }
        /* ADR-484 (2): la venta de un despacho llena su valor de venta si estaba vacío. Sin guía y con la venta en su cuenta, no:
           el cargo sin guía y el despacho no se juntan en el resultado del negocio y la venta saldría dos veces. */
        const valorVenta =
          venta && cub.origen === "despacho" && despacho
            ? !guia && cuenta
              ? ({ tipo: "valorVenta", estado: "sin_guia", lineas: [], previo: null, diferencia: null } satisfies ValorVentaDeCubicacion)
              : await llenarValorVentaEnTx(tx, tenantId, despacho.lineas, valor, cuenta ? guia : null)
            : null;

        const guardada = [...imputacion, ...(cuenta ? [cuenta] : []), ...(valorVenta ? [valorVenta] : [])];
        const row = await tx.forestCubicacionTrozas.update({
          where: { id },
          data: {
            estado: "aplicada",
            monto: new Prisma.Decimal(valor.monto.toFixed(2)),
            porEspecie: valor.porEspecie as unknown as Prisma.InputJsonValue,
            imputacion: guardada as unknown as Prisma.InputJsonValue,
            aplicadaAt: new Date(),
            aplicadaPor: actor.usuario || "unknown",
            idempotencyKey: clave,
            idempotencyHuella: huella,
          },
        });
        return { repetido: false as const, row, imputacion, cuenta, valorVenta };
      }, TX_OPTS);

    let hecho: Awaited<ReturnType<typeof escribir>>;
    try {
      hecho = await escribir();
    } catch (err) {
      if (err instanceof IdempotenciaDistintaError) throw new CubicacionTrozasError("IDEMPOTENCIA_DISTINTA", err.message);
      if (!esChoqueUnico(err)) throw err;
      /* El doble clic que llegó a la vez con la misma clave en OTRA cubicación. */
      throw new CubicacionTrozasError("IDEMPOTENCIA_DISTINTA", "Esa clave ya se usó en otra cubicación: vuelve a abrirla.");
    }
    const cubicacion = aDTO(hecho.row);
    if (hecho.repetido) return { cubicacion, imputacion: cubicacion.imputacion ?? [], repetido: true };

    invalidar(tenantId);
    AdelantosDB.invalidarResultado(tenantId);
    if (hecho.cuenta) ForestCuentaDB.invalidar(tenantId);
    const puestas = hecho.valorVenta?.estado === "puesto" ? hecho.valorVenta.lineas : [];
    if (puestas.length) invalidarDespachos(tenantId);
    const extra = [
      hecho.imputacion.length ? `a: ${textoImputacion(hecho.imputacion)}` : null,
      hecho.cuenta ? `a la cuenta de ${hecho.cuenta.parteNombre}: ${restoEnPalabras(hecho.cuenta.sentido, hecho.cuenta.monto)}` : null,
      puestas.length ? `valor de venta del despacho: S/ ${puestas.reduce((t, l) => t + l.valor, 0).toFixed(2)}` : null,
    ].filter(Boolean).join(" · ");
    await auditCtpEsperando(auditar("ctp_cubicacion_trozas_aplicar", tenantId, hecho.row, actor, extra)).catch((err) =>
      logger.error("[forest-cubicacion-trozas] auditoría de aplicar falló", { error: String(err), tenantId, id }),
    );
    for (const l of puestas) {
      auditCtp({
        tenantId, action: "ctp_venta_set", entity: "ForestCtpEntry", entityId: l.despachoId, user: actor.usuario || "unknown",
        detail: `Valor de venta S/ ${l.valor.toFixed(2)} puesto por la cubicación ${hecho.row.codigo}`,
      });
    }
    return { cubicacion, imputacion: hecho.imputacion, repetido: false };
  },

  /**
   * Baja lógica de sus entregas con recálculo de saldo, de las patas de su
   * cuenta (ADR-484) y del valor de venta que puso (sólo si sigue igual), en
   * la misma transacción. No se anula si un adelanto tocado o su cuenta tienen
   * una liquidación viva POSTERIOR (409): esa liquidación se calculó con esto.
   */
  async anular(tenantId: string, id: string, motivo: string, actor: ActorCubicacion): Promise<{ cubicacion: CubicacionTrozasDTO; repetido: boolean }> {
    if (!tenantId) throw new Error("tenantId is required");
    const hecho = await prisma.$transaction(async (tx) => {
      const previa = await tx.forestCubicacionTrozas.findFirst({
        where: { id, tenantId, deletedAt: null },
        select: { gtfNumber: true, beneficiarioId: true, parteId: true, imputacion: true, origen: true, origenId: true, cubicacionRefId: true },
      });
      if (!previa) throw new CubicacionTrozasError("NO_ENCONTRADA", "Esa cubicación no existe.");
      /* Los candados de «aplicar», en su orden: anular suelta la plata de la guía, y una puerta que le pone costo
         (`cubicacionQuePagoLaGuia`) o anota su venta (`cubicacionQueVendioLaGuia`) espera a que termine en vez de
         leer a medias. Con origen despacho, también la guía que el despacho tiene HOY y sus líneas. */
      const guiaHoy = previa.origen === "despacho" && previa.origenId ? await guiaActualDelDespacho(tx, tenantId, previa.origenId) : null;
      const guias = [...new Set([previa.gtfNumber, guiaHoy].filter((g): g is string => Boolean(g)))];
      if (guias.length) await ForestCuentaDB.bloquearGuiasEnTx(tx, tenantId, guias);
      await bloquearDespachoYRefEnTx(tx, tenantId, previa, guiaHoy);
      const beneficiarioId = await beneficiarioDe(tx, tenantId, previa);
      if (beneficiarioId) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`liq:${tenantId}:benef:${beneficiarioId}`}))`;
      /* La cuenta que tocó al aplicarse: la de su imputación, no la que la persona tenga hoy. */
      const cuentaPrevia = separarImputacion(previa.imputacion).cuenta;
      if (cuentaPrevia) await ForestCuentaDB.bloquearPartesEnTx(tx, tenantId, [cuentaPrevia.parteId]);
      await tx.$queryRaw`SELECT "id" FROM "ForestCubicacionTrozas" WHERE "id" = ${id} AND "tenantId" = ${tenantId} FOR UPDATE`;
      const cub = await tx.forestCubicacionTrozas.findFirst({ where: { id, tenantId, deletedAt: null } });
      if (!cub) throw new CubicacionTrozasError("NO_ENCONTRADA", "Esa cubicación no existe.");
      const sinCambios = { adelantos: 0, bajas: 0, valorVenta: { vaciadas: 0, quedaron: 0 }, cuenta: null };
      if (cub.estado === "anulada") return { repetido: true as const, row: cub, ...sinCambios };
      if (cub.estado !== "aplicada") throw new CubicacionTrozasError("NO_APLICADA", `${cub.codigo} no está aplicada: si no la quieres, bórrala.`);
      const { cuenta, valorVenta } = separarImputacion(cub.imputacion);
      if (cuenta && cuenta.parteId !== cuentaPrevia?.parteId) {
        throw new CubicacionTrozasError("DESACTUALIZADA", `${cub.codigo} cambió mientras la anulabas: vuelve a intentarlo.`, { version: cub.version });
      }

      const vivas = await tx.adelantoEntrega.findMany({
        where: { cubicacionId: id, anuladaAt: null, adelanto: { tenantId } },
        select: { adelantoId: true },
      });
      const tocados = [...new Set(vivas.map((e) => e.adelantoId))];
      /* Un adelanto tocado que ya se anuló: devolverle el saldo no lo revive
         (queda CANCELADO) y la madera pagada se pierde de la cuenta. Desde la
         revisión M, anular el adelanto se frena antes (`AdelantosDB.cancel`);
         esto es la segunda red para lo que ya quedó así. */
      const anulado = tocados.length > 0
        ? await tx.adelanto.findFirst({ where: { id: { in: tocados }, tenantId, status: "CANCELADO" }, select: { codigoOperacion: true } })
        : null;
      if (anulado) {
        throw new CubicacionTrozasError(
          "ADELANTO_ANULADO",
          `El adelanto ${anulado.codigoOperacion ?? "descontado"} ya está anulado: anular ${cub.codigo} le devolvería saldo a un adelanto muerto y la madera quedaría sin pagar en ninguna parte. Revisa esa cuenta con el administrador.`,
          { adelanto: anulado.codigoOperacion ?? null },
        );
      }
      if (tocados.length > 0 && cub.aplicadaAt) {
        const posterior = await tx.adelantoEntrega.findFirst({
          where: { adelantoId: { in: tocados }, anuladaAt: null, liquidacionId: { not: null }, createdAt: { gt: cub.aplicadaAt }, adelanto: { tenantId } },
          select: { liquidacionId: true },
        });
        if (posterior?.liquidacionId) {
          const liq = await tx.liquidacionCuenta.findFirst({ where: { id: posterior.liquidacionId, tenantId }, select: { codigo: true } });
          throw new CubicacionTrozasError(
            "LIQUIDADA_DESPUES",
            `Después de ${cub.codigo} se liquidó la cuenta (${liq?.codigo ?? "una liquidación"}): anula esa liquidación primero.`,
            { liquidacion: liq?.codigo ?? null },
          );
        }
      }
      /* Lo mismo con su cuenta forestal: la liquidación posterior se calculó con este resto. */
      if (cuenta && cub.aplicadaAt) {
        const liq = await ForestCuentaDB.liquidacionPosteriorEnTx(tx, tenantId, cuenta.parteId, cub.aplicadaAt);
        if (liq) {
          throw new CubicacionTrozasError("LIQUIDADA_DESPUES", `Después de ${cub.codigo} se liquidó la cuenta de ${cuenta.parteNombre} (${liq}): anula esa liquidación primero.`, {
            liquidacion: liq,
          });
        }
      }
      const { adelantoIds } = await AdelantosDB.anularEntregasDeCubicacionEnTx(tx, tenantId, id);
      const bajas = cuenta ? await ForestCuentaDB.bajaDeCubicacionEnTx(tx, tenantId, cuenta.movIds) : 0;
      const vaciado = await vaciarValorVentaEnTx(tx, tenantId, valorVenta);
      const row = await tx.forestCubicacionTrozas.update({
        where: { id },
        data: { estado: "anulada", anuladaAt: new Date(), anuladaPor: actor.usuario || "unknown", motivoAnulacion: motivo.trim() },
      });
      return { repetido: false as const, row, adelantos: adelantoIds.length, bajas, valorVenta: vaciado, cuenta };
    }, TX_OPTS);
    const cubicacion = aDTO(hecho.row);
    if (hecho.repetido) return { cubicacion, repetido: true };

    invalidar(tenantId);
    AdelantosDB.invalidarResultado(tenantId);
    if (hecho.bajas > 0) ForestCuentaDB.invalidar(tenantId);
    if (hecho.valorVenta.vaciadas > 0) invalidarDespachos(tenantId);
    const extra = [
      `motivo: ${hecho.row.motivoAnulacion ?? ""}`,
      `${hecho.adelantos} adelanto(s) recalculado(s)`,
      hecho.cuenta ? `cuenta de ${hecho.cuenta.parteNombre}: ${hecho.bajas} movimiento(s) de baja` : null,
      hecho.valorVenta.vaciadas ? `valor de venta vaciado en ${hecho.valorVenta.vaciadas} línea(s)` : null,
      hecho.valorVenta.quedaron ? `${hecho.valorVenta.quedaron} línea(s) con otro valor o mes cerrado: quedaron como estaban` : null,
    ].filter(Boolean).join(" · ");
    await auditCtpEsperando(auditar("ctp_cubicacion_trozas_anular", tenantId, hecho.row, actor, extra)).catch((err) =>
      logger.error("[forest-cubicacion-trozas] auditoría de anular falló", { error: String(err), tenantId, id }),
    );
    return { cubicacion, repetido: false };
  },
};

/**
 * Por qué no se pudo editar o borrar: no existe, es de otro material (ADR-483),
 * ya está aplicada/anulada, o la versión es otra.
 */
export async function explicarNoEditable(tenantId: string, id: string, material?: MaterialCubicacion): Promise<never> {
  const actual = await prisma.forestCubicacionTrozas.findFirst({
    where: { id, tenantId, deletedAt: null },
    select: { codigo: true, estado: true, version: true, material: true },
  });
  if (!actual) throw new CubicacionTrozasError("NO_ENCONTRADA", "Esa cubicación no existe.");
  if (material && materialDe(actual.material) !== material) {
    const es = materialDe(actual.material) === "aserrada" ? "madera aserrada" : "trozas";
    throw new CubicacionTrozasError("MATERIAL_DISTINTO", `${actual.codigo} es de ${es}: no se cambia de material. Haz otra cubicación.`);
  }
  if (actual.estado === "aplicada") {
    throw new CubicacionTrozasError("YA_APLICADA", `${actual.codigo} ya está aplicada a la cuenta: anúlala para cambiarla.`);
  }
  if (actual.estado === "anulada") throw new CubicacionTrozasError("ANULADA", `${actual.codigo} está anulada: no se cambia.`);
  throw new CubicacionTrozasError("DESACTUALIZADA", `Alguien cambió ${actual.codigo} mientras la mirabas: vuelve a abrirla.`, { version: actual.version });
}

type DatosNueva = Omit<Prisma.ForestCubicacionTrozasUncheckedCreateInput, "tenantId" | "codigo">;

/**
 * El alta con el siguiente «CUB-AAAA-NNNN» (año de la fecha de la cubicación)
 * bajo el lock `cub:{tenant}:codigo`; un choque de código se reintenta una vez.
 * La comparten las trozas y la madera aserrada (ADR-483 P5: un solo prefijo).
 */
export async function crearConCodigo(tenantId: string, fecha: string, data: DatosNueva): Promise<Row> {
  const crear = () =>
    prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`cub:${tenantId}:codigo`}))`;
      const anio = Number(fecha.slice(0, 4));
      const emitidos = await tx.forestCubicacionTrozas.findMany({
        where: { tenantId, codigo: { startsWith: `${PREFIJO_CUBICACION}-${anio}-` } },
        select: { codigo: true },
      });
      return tx.forestCubicacionTrozas.create({
        data: { ...data, tenantId, codigo: siguienteCodigo(emitidos.map((e) => e.codigo), anio, PREFIJO_CUBICACION) },
      });
    }, TX_OPTS);
  try {
    return await crear();
  } catch (err) {
    if (!esChoqueUnico(err)) throw err;
    return crear();
  }
}
