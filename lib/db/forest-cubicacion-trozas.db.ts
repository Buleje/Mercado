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
import { cubicacionQuePagoLaGuia, filtroMismaGuia } from "@/lib/db/guia-cubicacion.db";
import { mismoNumeroGtf } from "@/lib/forestal/gtf-talonario";
import {
  ExcedeLoRecibidoError,
  FaltaPrecioError,
  MedidaFueraDeRangoError,
  PREFIJO_CUBICACION,
  SinAdelantoAbiertoError,
  agruparPorEspecie,
  cubicarEnServidor,
  decimalesDe,
  descripcionEntregaMadera,
  direccionDelSentido,
  fmtVolumen,
  huellaAplicar,
  repartirFifo,
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
  | "SIN_ADELANTO_ABIERTO"
  | "EXCEDE_LO_RECIBIDO"
  | "FALTA_PRECIO"
  | "ADELANTO_NO_VALIDO"
  | "IDEMPOTENCIA_DISTINTA"
  | "LIQUIDADA_DESPUES"
  | "ADELANTO_ANULADO";

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
  SIN_ADELANTO_ABIERTO: 422,
  EXCEDE_LO_RECIBIDO: 422,
  FALTA_PRECIO: 422,
  ADELANTO_NO_VALIDO: 422,
  IDEMPOTENCIA_DISTINTA: 422,
  LIQUIDADA_DESPUES: 409,
  ADELANTO_ANULADO: 409,
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
type Db = Tx | typeof prisma;
type Row = NonNullable<Awaited<ReturnType<typeof prisma.forestCubicacionTrozas.findFirst>>>;
type RowResumen = Omit<Row, "trozas">;

const CACHE = "forest-cubic-trozas";
const TX_OPTS = { timeout: 20_000, maxWait: 10_000 } as const;
const ABIERTOS = ["ABIERTO", "EXCEDIDO"] as const;
const ESTADOS_GUIA_MUERTA = ["anulado", "rechazado"] as const;

const SELECT_RESUMEN = {
  id: true, tenantId: true, codigo: true, fecha: true, formula: true, diametros: true, beneficiarioId: true,
  parteId: true, personaNombre: true, sentido: true, gtfNumber: true, contratoId: true, nTrozas: true, volumen: true,
  porEspecie: true, monto: true, moneda: true, estado: true, version: true, aplicadaAt: true, aplicadaPor: true,
  imputacion: true, idempotencyKey: true, idempotencyHuella: true, anuladaAt: true, anuladaPor: true,
  motivoAnulacion: true, notas: true, createdBy: true, createdAt: true, updatedAt: true, deletedAt: true,
} satisfies Prisma.ForestCubicacionTrozasSelect;

const iso = (d: Date | null) => (d ? d.toISOString() : null);
const arr = <T>(v: Prisma.JsonValue | null | undefined): T[] | null => (Array.isArray(v) ? (v as unknown as T[]) : null);
const esChoqueUnico = (err: unknown) => typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
const estadoDe = (e: string): EstadoCubicacion => (e === "aplicada" || e === "anulada" ? e : "borrador");
/** La entrega se fecha con la hora real si es de hoy, y al mediodía de Lima si no (como la liquidación). */
const fechaEntrega = (fecha: string) => (fecha === limaDateKey() ? undefined : `${fecha}T12:00:00-05:00`);

function aResumen(r: RowResumen): CubicacionTrozasResumen {
  const formula = r.formula === "oxapampina" ? "oxapampina" : "smalian";
  return {
    id: r.id, codigo: r.codigo, fecha: r.fecha.toISOString().slice(0, 10), formula,
    diametros: r.diametros === 1 ? 1 : 2, unidad: unidadDe(formula),
    beneficiarioId: r.beneficiarioId, parteId: r.parteId, personaNombre: r.personaNombre,
    sentido: r.sentido === "venta" ? "venta" : "compra", gtfNumber: r.gtfNumber, contratoId: r.contratoId,
    nTrozas: r.nTrozas, volumen: Number(r.volumen), porEspecie: arr<LineaEspecie>(r.porEspecie),
    monto: r.monto == null ? null : Number(r.monto), moneda: r.moneda, estado: estadoDe(r.estado), version: r.version,
    aplicadaAt: iso(r.aplicadaAt), aplicadaPor: r.aplicadaPor, imputacion: arr<ImputacionGuardada>(r.imputacion),
    anuladaAt: iso(r.anuladaAt), anuladaPor: r.anuladaPor, motivoAnulacion: r.motivoAnulacion, notas: r.notas,
    createdBy: r.createdBy, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
  };
}
const aDTO = (r: Row): CubicacionTrozasDTO => ({ ...aResumen(r), trozas: arr<TrozaCongelada>(r.trozas) ?? [] });

function invalidar(tenantId: string): void {
  try {
    invalidateByPrefix(`${CACHE}:${tenantId}:`);
  } catch (err) {
    logger.error("[forest-cubicacion-trozas] no se pudo invalidar la caché", { error: String(err), tenantId });
  }
}

/** La persona del cuerpo, releída con `tenantId`: otra de otro negocio = 404. */
async function resolverPersona(db: Db, tenantId: string, input: { beneficiarioId?: string; parteId?: string }) {
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
 * Los adelantos a los que puede ir la madera: ABIERTO/EXCEDIDO del lado del
 * sentido, en SOLES y sin cuotas pactadas — el mismo criterio que
 * `clasificarAdelantos` de la liquidación (lib/cuentas/liquidacion.ts): la
 * cubicación vale en soles (S/ 586,36 no son $ 586,36) y una entrega suelta no
 * marca la cuota de un adelanto con entregas pactadas.
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

function cubicar(input: GuardarCubicacionInput) {
  try {
    return cubicarEnServidor(input.formula, input.trozas, input.diametros);
  } catch (err) {
    if (err instanceof MedidaFueraDeRangoError) throw new CubicacionTrozasError("MEDIDA_FUERA_DE_RANGO", err.message, { troza: err.n });
    throw err;
  }
}

async function exigirContrato(tenantId: string, contratoId: string | undefined): Promise<void> {
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
  const filtro = filtroMismaGuia(texto);
  const filas = filtro
    ? await prisma.woodEntry.findMany({
        where: { tenantId, gtfNumber: filtro, deletedAt: null, status: { notIn: [...ESTADOS_GUIA_MUERTA] } },
        select: { gtfNumber: true },
        orderBy: [{ entryDate: "asc" }, { id: "asc" }],
        take: 500,
      })
    : [];
  const igual = filas.find((f) => mismoNumeroGtf(f.gtfNumber, texto));
  if (igual) return igual.gtfNumber.trim();
  if (sentido === "venta") return texto;
  throw new CubicacionTrozasError(
    "GUIA_NO_ENCONTRADA",
    `La guía ${texto} no está en el Libro CTP de este negocio: revisa el número o regístrala primero. Si la madera no vino con guía, deja el campo vacío.`,
  );
}

/** Una guía, una sola plata (§6): ni abono `madera`, ni costo, ni otra cubicación aplicada. Bajo el lock de la guía; compara con `mismoNumeroGtf`. */
async function exigirGuiaSinPlata(tx: Tx, tenantId: string, gtf: string, id: string): Promise<void> {
  const filtro = filtroMismaGuia(gtf) ?? gtf;
  const esLaGuia = (f: { gtfNumber: string | null }) => f.gtfNumber === gtf || mismoNumeroGtf(f.gtfNumber, gtf);
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

function auditar(action: CtpAuditAction, tenantId: string, row: RowResumen, actor: ActorCubicacion, extra: string) {
  const formula = row.formula === "oxapampina" ? "oxapampina" : "smalian";
  const detail = [
    row.codigo,
    row.personaNombre ?? "sin persona",
    `${row.nTrozas} trozas · ${fmtVolumen(Number(row.volumen), formula)}`,
    row.monto != null ? `S/ ${Number(row.monto).toFixed(2)}` : null,
    row.gtfNumber ? `guía ${row.gtfNumber}` : null,
    extra || null,
    actor.ip ? `IP ${actor.ip}` : null,
  ].filter(Boolean).join(" · ");
  return { tenantId, action, entity: "ForestCubicacionTrozas" as const, entityId: row.id, detail, user: actor.usuario || "unknown" };
}

const textoImputacion = (imp: readonly ImputacionGuardada[]) =>
  imp.map((i) => `${i.codigoOperacion ?? i.adelantoId}: S/ ${i.monto.toFixed(2)}${i.excedido ? " (excedido)" : ""}`).join("; ");

export const ForestCubicacionTrozasDB = {
  async list(
    tenantId: string,
    filtros: { beneficiarioId?: string; parteId?: string; estado?: EstadoCubicacion } = {},
  ): Promise<CubicacionTrozasResumen[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const clave = `${CACHE}:${tenantId}:list:${filtros.beneficiarioId ?? ""}:${filtros.parteId ?? ""}:${filtros.estado ?? ""}`;
    return getOrSet(clave, 20, async () => {
      const rows = await prisma.forestCubicacionTrozas.findMany({
        where: {
          tenantId, deletedAt: null,
          ...(filtros.beneficiarioId ? { beneficiarioId: filtros.beneficiarioId } : {}),
          ...(filtros.parteId ? { parteId: filtros.parteId } : {}),
          ...(filtros.estado ? { estado: filtros.estado } : {}),
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
   * (FIFO, misma consulta que `aplicar`) y el último precio por especie que se
   * le aplicó a esta persona con la misma fórmula (R10).
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
    return { cubicacion, adelantosAbiertos, ultimosPrecios };
  },

  /** Alta de un borrador: re-cubica, toma el siguiente «CUB-AAAA-NNNN» bajo un lock del negocio. */
  async guardar(tenantId: string, input: GuardarCubicacionInput, actor: ActorCubicacion): Promise<CubicacionTrozasDTO> {
    if (!tenantId) throw new Error("tenantId is required");
    const persona = await resolverPersona(prisma, tenantId, input);
    await exigirContrato(tenantId, input.contratoId);
    const gtfNumber = await guiaCanonica(tenantId, input.sentido, input.gtfNumber);
    const { trozas, volumen } = cubicar(input);
    const crear = () =>
      prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`cub:${tenantId}:codigo`}))`;
        const anio = Number(input.fecha.slice(0, 4));
        const emitidos = await tx.forestCubicacionTrozas.findMany({
          where: { tenantId, codigo: { startsWith: `${PREFIJO_CUBICACION}-${anio}-` } },
          select: { codigo: true },
        });
        return tx.forestCubicacionTrozas.create({
          data: {
            tenantId,
            codigo: siguienteCodigo(emitidos.map((e) => e.codigo), anio, PREFIJO_CUBICACION),
            fecha: new Date(`${input.fecha}T00:00:00.000Z`),
            formula: input.formula,
            diametros: input.diametros,
            beneficiarioId: persona.beneficiarioId,
            parteId: persona.parteId,
            personaNombre: persona.nombre,
            sentido: input.sentido,
            gtfNumber,
            contratoId: input.contratoId || null,
            trozas: trozas as unknown as Prisma.InputJsonValue,
            nTrozas: trozas.length,
            volumen: new Prisma.Decimal(volumen.toFixed(4)),
            notas: input.notas || null,
            createdBy: actor.usuario || "unknown",
          },
        });
      }, TX_OPTS);
    let row: Row;
    try {
      row = await crear();
    } catch (err) {
      if (!esChoqueUnico(err)) throw err;
      row = await crear();
    }
    invalidar(tenantId);
    auditCtp(auditar("ctp_cubicacion_trozas_guardar", tenantId, row, actor, "borrador nuevo"));
    return aDTO(row);
  },

  /** Corrige un BORRADOR con la versión que se leyó. Aplicada o anulada no se edita. */
  async editar(tenantId: string, id: string, input: EditarCubicacionInput, actor: ActorCubicacion): Promise<CubicacionTrozasDTO> {
    if (!tenantId) throw new Error("tenantId is required");
    const persona = await resolverPersona(prisma, tenantId, input);
    await exigirContrato(tenantId, input.contratoId);
    const gtfNumber = await guiaCanonica(tenantId, input.sentido, input.gtfNumber);
    const { trozas, volumen } = cubicar(input);
    const res = await prisma.forestCubicacionTrozas.updateMany({
      where: { id, tenantId, estado: "borrador", version: input.version, deletedAt: null },
      data: {
        fecha: new Date(`${input.fecha}T00:00:00.000Z`),
        formula: input.formula,
        diametros: input.diametros,
        beneficiarioId: persona.beneficiarioId,
        parteId: persona.parteId,
        personaNombre: persona.nombre,
        sentido: input.sentido,
        gtfNumber,
        contratoId: input.contratoId || null,
        trozas: trozas as unknown as Prisma.InputJsonValue,
        nTrozas: trozas.length,
        volumen: new Prisma.Decimal(volumen.toFixed(4)),
        notas: input.notas || null,
        version: { increment: 1 },
      },
    });
    if (res.count === 0) await explicarNoEditable(tenantId, id);
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
   * transacción. El reintento con la misma clave y el mismo cuerpo devuelve lo
   * aplicado (`repetido`); con otro cuerpo, 422.
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
    const escribir = () =>
      prisma.$transaction(async (tx) => {
        const previa = await tx.forestCubicacionTrozas.findFirst({
          where: { id, tenantId, deletedAt: null },
          select: { gtfNumber: true, beneficiarioId: true, parteId: true },
        });
        if (!previa) throw new CubicacionTrozasError("NO_ENCONTRADA", "Esa cubicación no existe.");
        if (previa.gtfNumber) await ForestCuentaDB.bloquearGuiasEnTx(tx, tenantId, [previa.gtfNumber]);
        const beneficiarioId = await beneficiarioDe(tx, tenantId, previa);
        if (beneficiarioId) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`liq:${tenantId}:benef:${beneficiarioId}`}))`;
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
        const cambioDueno = cub.gtfNumber !== previa.gtfNumber || cub.beneficiarioId !== previa.beneficiarioId || cub.parteId !== previa.parteId;
        if (cub.version !== input.version || cambioDueno) {
          throw new CubicacionTrozasError("DESACTUALIZADA", `Alguien cambió ${cub.codigo} mientras la mirabas: vuelve a abrirla.`, { version: cub.version });
        }
        const otraConClave = await tx.forestCubicacionTrozas.findFirst({ where: { tenantId, idempotencyKey: clave, NOT: { id } }, select: { codigo: true } });
        if (otraConClave) throw new CubicacionTrozasError("IDEMPOTENCIA_DISTINTA", `Esa clave ya se usó para ${otraConClave.codigo}: vuelve a abrir la cubicación.`);
        if (cub.gtfNumber) await exigirGuiaSinPlata(tx, tenantId, cub.gtfNumber, id);

        const formula = cub.formula === "oxapampina" ? "oxapampina" : "smalian";
        const trozas = arr<TrozaCongelada>(cub.trozas) ?? [];
        let valor: ReturnType<typeof valorizar>;
        try {
          valor = valorizar(agruparPorEspecie(trozas, formula), input.precios);
        } catch (err) {
          if (err instanceof FaltaPrecioError) throw new CubicacionTrozasError("FALTA_PRECIO", err.message, { especie: err.especie });
          throw err;
        }
        if (!(valor.monto >= 0.01)) throw new CubicacionTrozasError("MONTO_CERO", "Con esos precios la madera vale S/ 0,00: revisa los precios.");
        if (Math.abs(valor.monto - input.montoVisto) > 0.005) {
          throw new CubicacionTrozasError("MONTO_CAMBIO", `El monto es S/ ${valor.monto.toFixed(2)}, no S/ ${input.montoVisto.toFixed(2)}: revisa la tabla antes de confirmar.`, {
            monto: valor.monto,
            porEspecie: valor.porEspecie,
          });
        }

        if (!beneficiarioId) {
          throw new CubicacionTrozasError("SIN_ADELANTO_ABIERTO", "Esta persona no tiene cuenta de adelantos: la cubicación queda guardada sin descontar.");
        }
        const direccion = direccionDelSentido(cub.sentido === "venta" ? "venta" : "compra");
        const pedidos = input.adelantoIds ? [...new Set(input.adelantoIds)] : undefined;
        const candidatos = await abiertosDe(tx, tenantId, beneficiarioId, direccion, pedidos);
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
        const abiertos = ids.length > 0 ? await abiertosDe(tx, tenantId, beneficiarioId, direccion, ids) : [];
        let partes: ReturnType<typeof repartirFifo>;
        try {
          partes = repartirFifo(valor.monto, Number(cub.volumen), abiertos, decimalesDe(formula));
        } catch (err) {
          if (err instanceof SinAdelantoAbiertoError) throw new CubicacionTrozasError("SIN_ADELANTO_ABIERTO", err.message);
          if (err instanceof ExcedeLoRecibidoError) throw new CubicacionTrozasError("EXCEDE_LO_RECIBIDO", err.message, { debe: err.debe });
          throw err;
        }

        const fecha = fechaEntrega(cub.fecha.toISOString().slice(0, 10));
        const imputacion: ImputacionGuardada[] = [];
        for (const [i, p] of partes.entries()) {
          const r = await AdelantosDB.registrarEntregaEnTx(tx, tenantId, p.adelantoId, {
            tipo: "LIBRE",
            valorManual: p.monto,
            cantidad: Math.round(p.volumen * 1000) / 1000,
            descripcion: descripcionEntregaMadera({ codigo: cub.codigo, nTrozas: cub.nTrozas, volumen: Number(cub.volumen), formula }, { i: i + 1, de: partes.length }),
            fecha,
            idempotencyKey: `${clave}:${p.adelantoId}`,
            cubicacionId: id,
          });
          if (!r || r.repetido || Math.abs(r.valor - p.monto) > 0.005) {
            throw new CubicacionTrozasError("IDEMPOTENCIA_DISTINTA", "La entrega de un adelanto no salió como se calculó: vuelve a abrir la cubicación.");
          }
          imputacion.push({ ...p, entregaId: r.entregaId });
        }
        const row = await tx.forestCubicacionTrozas.update({
          where: { id },
          data: {
            estado: "aplicada",
            monto: new Prisma.Decimal(valor.monto.toFixed(2)),
            porEspecie: valor.porEspecie as unknown as Prisma.InputJsonValue,
            imputacion: imputacion as unknown as Prisma.InputJsonValue,
            aplicadaAt: new Date(),
            aplicadaPor: actor.usuario || "unknown",
            idempotencyKey: clave,
            idempotencyHuella: huella,
          },
        });
        return { repetido: false as const, row, imputacion };
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
    await auditCtpEsperando(auditar("ctp_cubicacion_trozas_aplicar", tenantId, hecho.row, actor, `a: ${textoImputacion(hecho.imputacion)}`)).catch((err) =>
      logger.error("[forest-cubicacion-trozas] auditoría de aplicar falló", { error: String(err), tenantId, id }),
    );
    return { cubicacion, imputacion: hecho.imputacion, repetido: false };
  },

  /**
   * Baja lógica de sus entregas con recálculo de saldo. No se anula si un
   * adelanto tocado tiene una liquidación viva POSTERIOR (409): esa
   * liquidación se calculó con este pago.
   */
  async anular(tenantId: string, id: string, motivo: string, actor: ActorCubicacion): Promise<{ cubicacion: CubicacionTrozasDTO; repetido: boolean }> {
    if (!tenantId) throw new Error("tenantId is required");
    const hecho = await prisma.$transaction(async (tx) => {
      const previa = await tx.forestCubicacionTrozas.findFirst({ where: { id, tenantId, deletedAt: null }, select: { beneficiarioId: true, parteId: true } });
      if (!previa) throw new CubicacionTrozasError("NO_ENCONTRADA", "Esa cubicación no existe.");
      const beneficiarioId = await beneficiarioDe(tx, tenantId, previa);
      if (beneficiarioId) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`liq:${tenantId}:benef:${beneficiarioId}`}))`;
      await tx.$queryRaw`SELECT "id" FROM "ForestCubicacionTrozas" WHERE "id" = ${id} AND "tenantId" = ${tenantId} FOR UPDATE`;
      const cub = await tx.forestCubicacionTrozas.findFirst({ where: { id, tenantId, deletedAt: null } });
      if (!cub) throw new CubicacionTrozasError("NO_ENCONTRADA", "Esa cubicación no existe.");
      if (cub.estado === "anulada") return { repetido: true as const, row: cub, adelantos: 0 };
      if (cub.estado !== "aplicada") throw new CubicacionTrozasError("NO_APLICADA", `${cub.codigo} no está aplicada: si no la quieres, bórrala.`);

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
      const { adelantoIds } = await AdelantosDB.anularEntregasDeCubicacionEnTx(tx, tenantId, id);
      const row = await tx.forestCubicacionTrozas.update({
        where: { id },
        data: { estado: "anulada", anuladaAt: new Date(), anuladaPor: actor.usuario || "unknown", motivoAnulacion: motivo.trim() },
      });
      return { repetido: false as const, row, adelantos: adelantoIds.length };
    }, TX_OPTS);
    const cubicacion = aDTO(hecho.row);
    if (hecho.repetido) return { cubicacion, repetido: true };

    invalidar(tenantId);
    AdelantosDB.invalidarResultado(tenantId);
    await auditCtpEsperando(
      auditar("ctp_cubicacion_trozas_anular", tenantId, hecho.row, actor, `motivo: ${hecho.row.motivoAnulacion ?? ""} · ${hecho.adelantos} adelanto(s) recalculado(s)`),
    ).catch((err) => logger.error("[forest-cubicacion-trozas] auditoría de anular falló", { error: String(err), tenantId, id }));
    return { cubicacion, repetido: false };
  },
};

/** Por qué no se pudo editar o borrar: no existe, ya está aplicada/anulada, o la versión es otra. */
async function explicarNoEditable(tenantId: string, id: string): Promise<never> {
  const actual = await prisma.forestCubicacionTrozas.findFirst({
    where: { id, tenantId, deletedAt: null },
    select: { codigo: true, estado: true, version: true },
  });
  if (!actual) throw new CubicacionTrozasError("NO_ENCONTRADA", "Esa cubicación no existe.");
  if (actual.estado === "aplicada") {
    throw new CubicacionTrozasError("YA_APLICADA", `${actual.codigo} ya está aplicada a la cuenta: anúlala para cambiarla.`);
  }
  if (actual.estado === "anulada") throw new CubicacionTrozasError("ANULADA", `${actual.codigo} está anulada: no se cambia.`);
  throw new CubicacionTrozasError("DESACTUALIZADA", `Alguien cambió ${actual.codigo} mientras la mirabas: vuelve a abrirla.`, { version: actual.version });
}
