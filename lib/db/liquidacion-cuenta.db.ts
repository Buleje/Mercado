import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { isSpecializationEnabled } from "@/lib/specializations";
import { limaDateKey } from "@/lib/utils";
import { AdelantosDB } from "@/lib/db/adelantos.db";
import { ForestCuentaDB } from "@/lib/db/forest-cuenta.db";
import { CTP_TX_OPTS } from "@/lib/db/forest-ctp-consumo.db";
import { PREFIJO_LIQUIDACION, siguienteCodigo } from "@/lib/adelantos/codigo-operacion";
import {
  etiquetaAnulacionLiquidacion,
  etiquetaLiquidacion,
  moverCaja,
  type MetodoPago,
  type ResultadoMovimiento,
} from "@/lib/adelantos/movimiento-caja";
import {
  clasificarAdelantos,
  descripcionEntrega,
  detalleDeLiquidacion,
  fechaDeudaViva,
  huellaDe,
  motivoNoSePuedeAnular,
  notasMovimiento,
  planLiquidacion,
  type DetalleLiquidacion,
  type DireccionPago,
  type LiquidacionDTO,
  type LiquidacionInput,
  type PartidasDePersona,
  type PlanLiquidacion,
} from "@/lib/cuentas/liquidacion";

export type { LiquidacionDTO } from "@/lib/cuentas/liquidacion";

/**
 * LiquidacionCuentaDB — liquidar la cuenta de una persona (ADR-413).
 *
 * ORQUESTA: no escribe ninguna tabla ajena por su cuenta. Las entregas las
 * escribe `AdelantosDB.registrarEntregaEnTx` y los movimientos
 * `ForestCuentaDB.crearDeLiquidacionEnTx`, todo dentro de UNA transacción con
 * la cabecera. La caja va después del commit, una vez por acto.
 *
 * `tenantId` 1er parámetro; cada id del cuerpo se relee con `tenantId`, y la
 * persona se resuelve en el servidor: nunca se cruza un beneficiario con una
 * parte que no sea su `forestPartyId`.
 */

// ── Errores ──────────────────────────────────────────────────────────────────

export class PersonaNoEncontradaError extends Error {
  constructor() {
    super("Esa persona no existe en este negocio.");
    this.name = "PersonaNoEncontradaError";
  }
}

export class SinVinculoError extends Error {
  constructor() {
    super("Para cruzar las dos libretas, primero confirma que es la misma persona.");
    this.name = "SinVinculoError";
  }
}

export class PlanCambioError extends Error {
  constructor(readonly partidas: PartidasDePersona, readonly huella: string) {
    super("La cuenta cambió mientras la mirabas: revisa la vista previa.");
    this.name = "PlanCambioError";
  }
}

export class PlanInvalidoError extends Error {
  constructor(readonly errores: string[]) {
    super(errores[0] ?? "La liquidación no es válida.");
    this.name = "PlanInvalidoError";
  }
}

export class CuentaForestalDeshabilitadaError extends Error {
  constructor() {
    super("La cuenta forestal no está habilitada en este negocio.");
    this.name = "CuentaForestalDeshabilitadaError";
  }
}

export class NoEsLaUltimaError extends Error {
  constructor(readonly codigo: string, motivo: string) {
    super(motivo);
    this.name = "NoEsLaUltimaError";
  }
}

export class LiquidacionYaAnuladaError extends Error {
  constructor(readonly codigo: string) {
    super(`La liquidación ${codigo} ya está anulada.`);
    this.name = "LiquidacionYaAnuladaError";
  }
}

// ── Lectura ──────────────────────────────────────────────────────────────────

type Tx = Prisma.TransactionClient;
type Row = Prisma.LiquidacionCuentaGetPayload<Record<string, never>>;
type PersonaPedida = { beneficiarioId?: string; parteId?: string };

const esChoqueUnico = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";

function aDTO(r: Row): LiquidacionDTO {
  return {
    id: r.id,
    codigo: r.codigo,
    fecha: r.fecha.toISOString().slice(0, 10),
    persona: { beneficiarioId: r.beneficiarioId, parteId: r.parteId, nombre: r.personaNombre, documento: r.personaDocumento },
    compensado: Number(r.montoCompensado),
    pago:
      r.pagoDireccion && r.pagoMonto != null && r.metodoPago
        ? {
            direccion: r.pagoDireccion as DireccionPago,
            monto: Number(r.pagoMonto),
            metodo: r.metodoPago as MetodoPago,
            moverCaja: r.moverCaja,
          }
        : null,
    caja: {
      resultado: (r.cajaResultado as LiquidacionDTO["caja"]["resultado"]) ?? null,
      movimientoId: r.cajaMovimientoId,
    },
    detalle: r.detalle as unknown as DetalleLiquidacion,
    notas: r.notas,
    creadaPor: r.createdBy,
    creadaEn: r.createdAt.toISOString(),
    anulada: r.anuladaAt
      ? { en: r.anuladaAt.toISOString(), por: r.anuladaPor ?? "", motivo: r.motivoAnulacion ?? "", reversionCajaId: r.cajaReversionId }
      : null,
  };
}

/**
 * Las partidas de una persona, leídas con `tx` (dentro del lock cuando se
 * crea). Con beneficiario, la parte sale SÓLO de su `forestPartyId`: una parte
 * pedida que no es la suya no se lee — quién decide si eso es un 409 es `crear`,
 * según el plan toque o no la cuenta forestal.
 */
async function leerPartidas(
  tx: Tx,
  tenantId: string,
  pedida: PersonaPedida,
  opts: { forestal: boolean },
): Promise<{ partidas: PartidasDePersona; parteNombre: string | null; vinculoParteId: string | null } | null> {
  let benef: { id: string; nombre: string; documento: string | null; forestPartyId: string | null } | null = null;
  const sel = { id: true, nombre: true, documento: true, forestPartyId: true } as const;
  if (pedida.beneficiarioId) {
    benef = await tx.adelantoBeneficiario.findFirst({ where: { id: pedida.beneficiarioId, tenantId }, select: sel });
    if (!benef) return null;
  } else if (pedida.parteId) {
    /* Si alguien de Adelantos ya está vinculado a esta parte, es esa persona entera. */
    benef = await tx.adelantoBeneficiario.findFirst({ where: { tenantId, forestPartyId: pedida.parteId }, select: sel });
  }

  /* La parte sale SÓLO del vínculo explícito cuando hay beneficiario (ADR-413 §4). */
  let parteId = benef ? benef.forestPartyId : (pedida.parteId ?? null);
  if (parteId && !opts.forestal) {
    if (!benef) throw new CuentaForestalDeshabilitadaError();
    parteId = null;
  }
  const parte = parteId
    ? await tx.forestParty.findFirst({ where: { id: parteId, tenantId }, select: { id: true, nombre: true, docNumero: true } })
    : null;
  if (parteId && !parte) parteId = null;
  if (!benef && !parte) return null;

  const filas = benef
    ? await tx.adelanto.findMany({
        where: { tenantId, beneficiarioId: benef.id, status: { in: ["ABIERTO", "EXCEDIDO"] } },
        select: {
          id: true,
          codigoOperacion: true,
          fechaAdelanto: true,
          saldoPendiente: true,
          moneda: true,
          modalidad: true,
          status: true,
          _count: { select: { entregasPactadas: true } },
        },
      })
    : [];
  const { adelantos, fuera } = clasificarAdelantos(
    filas.map((a) => ({
      id: a.id,
      codigo: a.codigoOperacion,
      fecha: a.fechaAdelanto.toISOString(),
      saldo: Number(a.saldoPendiente),
      moneda: a.moneda,
      modalidad: a.modalidad,
      status: a.status,
      cuotasPactadas: a._count.entregasPactadas,
    })),
  );

  let forestal: PartidasDePersona["forestal"] = null;
  if (parteId) {
    /* Una tras otra: dentro de una transacción interactiva la conexión es una
       sola, y dos consultas en paralelo sobre ella no ganan nada. */
    const movimientos = await ForestCuentaDB.movimientosDeParteEnTx(tx, tenantId, parteId);
    const saldo = await ForestCuentaDB.saldoDeParteEnTx(tx, tenantId, parteId);
    forestal = { saldo, desde: fechaDeudaViva(movimientos), movimientos };
  }

  return {
    parteNombre: parte?.nombre ?? null,
    vinculoParteId: benef?.forestPartyId ?? null,
    partidas: {
      persona: {
        beneficiarioId: benef?.id ?? null,
        parteId: forestal ? parteId : null,
        nombre: benef?.nombre ?? parte?.nombre ?? "—",
        documento: benef?.documento ?? parte?.docNumero ?? null,
      },
      cruzable: Boolean(benef && forestal && benef.forestPartyId === parteId),
      adelantos,
      forestal,
      fuera,
    },
  };
}

/** Las claves de los locks de persona, siempre en el mismo orden. */
async function bloquearPersona(tx: Tx, tenantId: string, ids: { beneficiarioId: string | null; parteId: string | null }) {
  if (ids.beneficiarioId) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`liq:${tenantId}:benef:${ids.beneficiarioId}`}))`;
  }
  if (ids.parteId) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`liq:${tenantId}:parte:${ids.parteId}`}))`;
  }
}

/** La entrega se fecha con la hora real si es de hoy, y al mediodía de Lima si no. */
const fechaEntrega = (fecha: string) => (fecha === limaDateKey() ? undefined : `${fecha}T12:00:00-05:00`);

// ── API ──────────────────────────────────────────────────────────────────────

export const LiquidacionCuentaDB = {
  async partidas(tenantId: string, persona: PersonaPedida): Promise<PartidasDePersona | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const forestal = await isSpecializationEnabled(tenantId, "spec:forestal:ctp-libro");
    const r = await prisma.$transaction((tx) => leerPartidas(tx, tenantId, persona, { forestal }), CTP_TX_OPTS);
    return r?.partidas ?? null;
  },

  async crear(
    tenantId: string,
    input: LiquidacionInput,
    usuario: string,
  ): Promise<{ liquidacion: LiquidacionDTO; repetida: boolean; caja: ResultadoMovimiento | null }> {
    if (!tenantId) throw new Error("tenantId is required");
    const forestalHabilitada = await isSpecializationEnabled(tenantId, "spec:forestal:ctp-libro");

    const escribir = () =>
      prisma.$transaction(async (tx) => {
        /* Quién es, antes de bloquear: los locks van por persona. */
        const previa = await leerPartidas(tx, tenantId, input.persona, { forestal: forestalHabilitada });
        if (!previa) throw new PersonaNoEncontradaError();
        /* Todo lo que toca la cuenta forestal exige el vínculo EXPLÍCITO
           (ADR-413 §4): un DNI mal tipeado cruzaría las deudas de dos personas.
           Una fila unida sólo por documento manda los dos ids; cobrar o pagar
           dentro de Adelantos se puede igual, cruzar libretas no. */
        const tocaForestal =
          input.compensar > 0 || input.pago?.direccion === "hecho" || Boolean(input.imputacion?.pago?.some((x) => x.partida === "forestal"));
        const parteAjena = Boolean(
          input.persona.beneficiarioId && input.persona.parteId && input.persona.parteId !== previa.vinculoParteId,
        );
        if (tocaForestal && parteAjena) throw new SinVinculoError();
        if (tocaForestal && !forestalHabilitada) throw new CuentaForestalDeshabilitadaError();
        await bloquearPersona(tx, tenantId, previa.partidas.persona);

        const ya = await tx.liquidacionCuenta.findFirst({ where: { tenantId, idempotencyKey: input.idempotencyKey } });
        if (ya) return { repetida: true as const, row: ya };

        if (previa.partidas.persona.beneficiarioId) {
          await tx.$queryRaw`
            SELECT "id" FROM "Adelanto"
            WHERE "tenantId" = ${tenantId} AND "beneficiarioId" = ${previa.partidas.persona.beneficiarioId} AND "status" = 'ABIERTO'
            ORDER BY "id" FOR UPDATE
          `;
        }

        /* Se releen DENTRO del lock: lo que se confirmó tiene que ser lo que se escribe. */
        const leida = await leerPartidas(tx, tenantId, input.persona, { forestal: forestalHabilitada });
        if (!leida) throw new PersonaNoEncontradaError();
        const { partidas, parteNombre } = leida;
        const huella = huellaDe(partidas);
        if (huella !== input.huella) throw new PlanCambioError(partidas, huella);

        const r = planLiquidacion(partidas, {
          fecha: input.fecha,
          compensar: input.compensar,
          pago: input.pago,
          imputacion: input.imputacion,
          notas: input.notas,
        });
        if (!r.ok) throw new PlanInvalidoError(r.errores);
        const plan = r.plan;

        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`liq:${tenantId}:codigo`}))`;
        const anio = Number(input.fecha.slice(0, 4));
        const emitidos = await tx.liquidacionCuenta.findMany({
          where: { tenantId, codigo: { startsWith: `${PREFIJO_LIQUIDACION}-${anio}-` } },
          select: { codigo: true },
        });
        const codigo = siguienteCodigo(
          emitidos.map((e) => e.codigo),
          anio,
          PREFIJO_LIQUIDACION,
        );

        const pago = plan.pago;
        const cab = await tx.liquidacionCuenta.create({
          data: {
            tenantId,
            codigo,
            idempotencyKey: input.idempotencyKey,
            beneficiarioId: partidas.persona.beneficiarioId,
            parteId: partidas.persona.parteId,
            personaNombre: partidas.persona.nombre,
            personaDocumento: partidas.persona.documento,
            fecha: new Date(`${input.fecha}T00:00:00.000Z`),
            montoCompensado: new Prisma.Decimal(plan.compensado),
            pagoDireccion: pago?.direccion ?? null,
            pagoMonto: pago ? new Prisma.Decimal(pago.monto) : null,
            metodoPago: pago?.metodo ?? null,
            moverCaja: Boolean(pago?.moverCaja),
            cajaResultado: pago?.moverCaja ? null : "no_mover",
            detalle: {} as Prisma.InputJsonValue,
            notas: input.notas?.trim() || null,
            createdBy: usuario || "unknown",
          },
        });

        const entregaIds: string[] = [];
        for (const e of plan.entregas) {
          const hecha = await AdelantosDB.registrarEntregaEnTx(tx, tenantId, e.adelantoId, {
            tipo: "LIBRE",
            valorManual: e.valor,
            descripcion: descripcionEntrega(e, codigo, pago?.metodo ?? null),
            fecha: fechaEntrega(input.fecha),
            liquidacionId: cab.id,
          });
          if (!hecha) throw new PlanCambioError(partidas, huella);
          entregaIds.push(hecha.entregaId);
        }

        const movimientoIds: string[] = [];
        for (const m of plan.movimientos) {
          if (!partidas.persona.parteId) throw new PlanCambioError(partidas, huella);
          const mov = await ForestCuentaDB.crearDeLiquidacionEnTx(
            tx,
            tenantId,
            {
              parteId: partidas.persona.parteId,
              parteNombre: parteNombre ?? partidas.persona.nombre,
              fecha: input.fecha,
              tipo: m.tipo,
              concepto: m.concepto,
              monto: m.monto,
              moneda: "PEN",
              referencia: codigo,
              notas: notasMovimiento(m, codigo),
              liquidacionId: cab.id,
            },
            usuario,
          );
          movimientoIds.push(mov.id);
        }

        const detalle = detalleDeLiquidacion(plan, { codigo, entregaIds, movimientoIds });
        const row = await tx.liquidacionCuenta.update({
          where: { id: cab.id },
          data: { detalle: detalle as unknown as Prisma.InputJsonValue },
        });
        return { repetida: false as const, row, plan };
      }, CTP_TX_OPTS);

    let hecho: Awaited<ReturnType<typeof escribir>>;
    try {
      hecho = await escribir();
    } catch (err) {
      if (!esChoqueUnico(err)) throw err;
      /* El doble clic que llegó a la vez: la otra transacción ya la guardó. */
      const ya = await prisma.liquidacionCuenta.findFirst({ where: { tenantId, idempotencyKey: input.idempotencyKey } });
      if (ya) return { liquidacion: aDTO(ya), repetida: true, caja: null };
      /* Si no, chocó el código con otra persona liquidando a la vez: una vez más. */
      hecho = await escribir();
    }
    if (hecho.repetida) return { liquidacion: aDTO(hecho.row), repetida: true, caja: null };

    let { row } = hecho;
    const plan: PlanLiquidacion = hecho.plan;
    let caja: ResultadoMovimiento | null = null;
    if (plan.caja) {
      caja = await moverCaja(tenantId, {
        tipo: plan.caja.tipo,
        monto: plan.caja.monto,
        metodo: plan.caja.metodo,
        etiqueta: etiquetaLiquidacion(row.codigo, row.personaNombre),
      });
      const resultado = caja.movimientoId ? "movida" : caja.sinCaja ? "sin_caja" : "fallo";
      row = await prisma.liquidacionCuenta.update({
        where: { id: row.id },
        data: { cajaResultado: resultado, cajaMovimientoId: caja.movimientoId ?? null },
      });
    }

    const partes = [
      plan.compensado > 0 ? `cruce S/ ${plan.compensado.toFixed(2)}` : null,
      plan.pago ? `pago ${plan.pago.direccion} S/ ${plan.pago.monto.toFixed(2)} (${plan.pago.metodo})` : null,
      `${plan.entregas.length} entrega(s) en adelantos · ${plan.movimientos.length} movimiento(s) en la cuenta forestal`,
      `caja: ${row.cajaResultado ?? "sin datos"}`,
    ].filter(Boolean);
    logActivity(
      "liquidacion_cuenta_crear",
      "LiquidacionCuenta",
      `${row.codigo} · ${row.personaNombre} · ${partes.join(" · ")}`,
      row.id,
      usuario,
      undefined,
      tenantId,
    ).catch((err) => logger.error("[liquidacion-cuenta] logActivity failed", { error: String(err) }));
    ForestCuentaDB.invalidar(tenantId);

    return { liquidacion: aDTO(row), repetida: false, caja };
  },

  async listar(
    tenantId: string,
    persona: PersonaPedida,
    opts: { incluirAnuladas?: boolean; limite?: number } = {},
  ): Promise<LiquidacionDTO[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const OR: Prisma.LiquidacionCuentaWhereInput[] = [];
    if (persona.beneficiarioId) OR.push({ beneficiarioId: persona.beneficiarioId });
    if (persona.parteId) OR.push({ parteId: persona.parteId });
    if (OR.length === 0) return [];
    const rows = await prisma.liquidacionCuenta.findMany({
      where: { tenantId, OR, ...(opts.incluirAnuladas ? {} : { anuladaAt: null }) },
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(opts.limite ?? 50, 1), 200),
    });
    return rows.map(aDTO);
  },

  async obtener(tenantId: string, id: string): Promise<LiquidacionDTO | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const row = await prisma.liquidacionCuenta.findFirst({ where: { id, tenantId } });
    return row ? aDTO(row) : null;
  },

  async anular(
    tenantId: string,
    id: string,
    opts: { motivo: string; devolucionCaja: MetodoPago | null },
    usuario: string,
  ): Promise<LiquidacionDTO | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const hecho = await prisma.$transaction(async (tx) => {
      const previa = await tx.liquidacionCuenta.findFirst({ where: { id, tenantId } });
      if (!previa) return null;
      await bloquearPersona(tx, tenantId, { beneficiarioId: previa.beneficiarioId, parteId: previa.parteId });
      const liq = await tx.liquidacionCuenta.findFirst({ where: { id, tenantId } });
      if (!liq) return null;
      if (liq.anuladaAt) throw new LiquidacionYaAnuladaError(liq.codigo);

      const OR: Prisma.LiquidacionCuentaWhereInput[] = [];
      if (liq.beneficiarioId) OR.push({ beneficiarioId: liq.beneficiarioId });
      if (liq.parteId) OR.push({ parteId: liq.parteId });
      const ultimaViva = await tx.liquidacionCuenta.findFirst({
        where: { tenantId, anuladaAt: null, OR },
        orderBy: { createdAt: "desc" },
        select: { id: true, codigo: true },
      });
      const motivo = motivoNoSePuedeAnular({ id: liq.id, anulada: false }, ultimaViva);
      if (motivo) throw new NoEsLaUltimaError(ultimaViva?.codigo ?? liq.codigo, motivo);

      const { adelantoIds } = await AdelantosDB.anularEntregasDeLiquidacionEnTx(tx, tenantId, liq.id);
      const movimientos = await ForestCuentaDB.bajaDeLiquidacionEnTx(tx, tenantId, liq.id);
      const row = await tx.liquidacionCuenta.update({
        where: { id: liq.id },
        data: { anuladaAt: new Date(), anuladaPor: usuario || "unknown", motivoAnulacion: opts.motivo.trim() },
      });
      return { row, adelantos: adelantoIds.length, movimientos };
    }, CTP_TX_OPTS);
    if (!hecho) return null;

    let { row } = hecho;
    /* La caja no se revierte sola, y sólo se revierte lo que de verdad se movió:
       devolver un pago que nunca pasó por el cajón descuadraría el arqueo. */
    let reversion = "no se pidió";
    if (opts.devolucionCaja && row.pagoMonto != null && row.pagoDireccion) {
      if (row.cajaResultado === "movida") {
        const caja = await moverCaja(tenantId, {
          tipo: row.pagoDireccion === "recibido" ? "egreso" : "ingreso",
          monto: Number(row.pagoMonto),
          metodo: opts.devolucionCaja,
          etiqueta: etiquetaAnulacionLiquidacion(row.codigo, row.personaNombre),
        });
        reversion = caja.movimientoId ? "revertida" : caja.sinCaja ? "sin caja abierta" : "falló";
        if (caja.movimientoId) {
          row = await prisma.liquidacionCuenta.update({ where: { id: row.id }, data: { cajaReversionId: caja.movimientoId } });
        }
      } else {
        reversion = "no se revierte: el pago no se había anotado en la caja";
      }
    }

    logActivity(
      "liquidacion_cuenta_anular",
      "LiquidacionCuenta",
      `${row.codigo} · ${row.personaNombre} · motivo: ${row.motivoAnulacion ?? ""} · ${hecho.adelantos} adelanto(s) recalculado(s) · ${hecho.movimientos} movimiento(s) dados de baja · caja: ${reversion}`,
      row.id,
      usuario,
      undefined,
      tenantId,
    ).catch((err) => logger.error("[liquidacion-cuenta] logActivity failed", { error: String(err) }));
    ForestCuentaDB.invalidar(tenantId);
    return aDTO(row);
  },
};
