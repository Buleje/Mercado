import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { logger } from "@/lib/logger";
import { moverCajaEnTx, type MetodoPago, type ResultadoMovimiento } from "@/lib/adelantos/movimiento-caja";
import { etiquetaCobroFiado } from "@/lib/fiados/cobro-metodo";
import {
  aCentimos,
  FiadoNoCobrableError,
  repartirCobroMasivo,
  type PedidoCobroMasivo,
} from "@/lib/fiados/reparto-cobro-masivo";

// ── Error classes ─────────────────────────────────────────────────────────────

/**
 * Race-condition o write-conflict detectado dentro de una transacción.
 * Los handlers HTTP deben mapearlo a 409 Conflict (no 503), porque el
 * caller puede reintentar de inmediato — la DB está sana, solo había
 * contención.
 *
 * Prisma lo lanza con código P2034 (TransactionConflict). Algunas versiones
 * de Postgres usan SQLSTATE 40001 (serialization_failure) o 40P01 (deadlock).
 */
export class FiadoConflictError extends Error {
  readonly code = "FIADO_CONFLICT";
  constructor(message: string) {
    super(message);
    this.name = "FiadoConflictError";
  }
}

/**
 * El pago tipeado excede el saldo pendiente. Es un error de VALIDACIÓN (el
 * cajero se equivocó de monto), no de infraestructura — antes registerPago
 * lo lanzaba como Error plano y el handler HTTP lo confundía con una falla
 * de DB, respondiendo 503 "Database error" en vez del motivo real (audit
 * 2026-08-26).
 */
export class FiadoOverpaymentError extends Error {
  readonly code = "FIADO_OVERPAYMENT";
  constructor(message: string) {
    super(message);
    this.name = "FiadoOverpaymentError";
  }
}

/**
 * Detecta si un error es race-condition de Prisma/Postgres. Centraliza el
 * pattern para que los handlers HTTP no tengan que conocer códigos internos.
 */
export function isPrismaConflict(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message;
  // Prisma client: PrismaClientKnownRequestError with code P2034
  // (también P2002 unique-violation puede surgir en algunas races pero rara
  // vez se mapea a conflict aquí).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const code = (err as any).code;
  if (code === "P2034") return true;
  // Postgres SQLSTATE 40001 (serialization) o 40P01 (deadlock)
  if (/40001|40P01/.test(msg)) return true;
  if (/transaction conflict|could not serialize|deadlock detected/i.test(msg)) return true;
  return false;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type DbFiado = {
  id: string;
  tenantId: string;
  customerId: string;
  customerName?: string;
  /** Límite de crédito del cliente (0 = sin tope). Sólo lo trae `list()`. */
  customerCreditLimit?: number;
  total: number;
  saldo: number;
  descripcion?: string;
  status: "ACTIVO" | "PAGADO" | "VENCIDO" | "CANCELADO";
  fechaVence?: string;
  cuotas: DbFiadoCuota[];
  createdAt: string;
  updatedAt: string;
};

/**
 * El cobro también entra a la caja abierta (ingreso), en la MISMA transacción
 * que el pago: si no hay caja abierta el pago se registra igual y se avisa
 * con `sinCaja`. Mismo patrón que los adelantos (ADR-448,
 * `lib/adelantos/movimiento-caja.ts`): la caja es el ÚLTIMO lock de la tx.
 */
export type CajaDelCobro = { metodo: MetodoPago; etiqueta: string };

/** Un fiado abonado por el cobro masivo. */
export type ResultadoCobroMasivo = {
  fiadoId: string;
  montoPagado: number;
  nuevoSaldo: number;
  status: string;
  customerId: string;
};

export type DbFiadoCuota = {
  id: string;
  fiadoId: string;
  monto: number;
  pagadoEn?: string;
  notas?: string;
  createdAt: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function toISO(d: Date): string {
  return d.toISOString();
}

function toNum(d: Prisma.Decimal | null | undefined): number {
  return d ? Number(d) : 0;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapFiado(f: any): DbFiado {
  return {
    id: f.id,
    tenantId: f.tenantId,
    customerId: f.customerId,
    ...(f.customer?.name && { customerName: f.customer.name }),
    ...(f.customer?.creditLimit != null && { customerCreditLimit: Number(f.customer.creditLimit) || 0 }),
    total: toNum(f.total),
    saldo: toNum(f.saldo),
    ...(f.descripcion != null && { descripcion: f.descripcion }),
    status: f.status,
    ...(f.fechaVence != null && { fechaVence: toISO(f.fechaVence) }),
    cuotas: (f.cuotas ?? []).map(mapCuota),
    createdAt: toISO(f.createdAt),
    updatedAt: toISO(f.updatedAt),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapCuota(c: any): DbFiadoCuota {
  return {
    id: c.id,
    fiadoId: c.fiadoId,
    monto: toNum(c.monto),
    ...(c.pagadoEn != null && { pagadoEn: toISO(c.pagadoEn) }),
    ...(c.notas != null && { notas: c.notas }),
    createdAt: toISO(c.createdAt),
  };
}

// ── Fiados DB ─────────────────────────────────────────────────────────────────

export const FiadosDB = {
  async list(
    tenantId: string,
    filters?: { status?: string; customerId?: string }
  ): Promise<DbFiado[]> {
    const where: Record<string, unknown> = { tenantId };
    if (filters?.status) where.status = filters.status;
    if (filters?.customerId) where.customerId = filters.customerId;

    const rows = await prisma.fiado.findMany({
      where,
      include: { cuotas: { orderBy: { createdAt: "asc" } } },
      orderBy: { createdAt: "desc" },
    });
    // Fetch customer names separately to avoid relation errors with multi-tenant extension.
    //
    // Audit 2026-05-17 P2-2: tenantId AGREGADO al where. Hoy `Customer.phone`
    // es @unique global (TD-040 Phase 1), pero cuando Phase 3 contract lo
    // relaje a @@unique([tenantId, phone]) sin este filtro devolveríamos
    // names de OTROS tenants. Defense-in-depth ahora antes de la migración.
    const customerPhones = [...new Set(rows.map(r => r.customerId))];
    const customers = customerPhones.length > 0
      ? await prisma.customer.findMany({
          where: { tenantId, phone: { in: customerPhones } },
          select: { phone: true, name: true, creditLimit: true },
        })
      : [];
    const customerMap = new Map(customers.map(c => [c.phone, c]));
    return rows.map(r => {
      const c = customerMap.get(r.customerId);
      return mapFiado({ ...r, customer: { name: c?.name || null, creditLimit: c?.creditLimit ?? null } });
    });
  },

  async getById(tenantId: string, id: string): Promise<DbFiado | null> {
    const row = await prisma.fiado.findFirst({
      where: { id, tenantId },
      include: { cuotas: { orderBy: { createdAt: "asc" } } },
    });
    if (!row) return null;
    // Fetch customer name separately
    const customer = await prisma.customer.findFirst({ where: { phone: row.customerId, tenantId }, select: { name: true } }).catch((err) => {
      logger.warn("FiadosDB.getById: customer lookup failed (non-critical)", { fiadoId: id, err: String(err) });
      return null;
    });
    return mapFiado({ ...row, customer: { name: customer?.name || null } });
  },

  /**
   * Validaciones de scoring crediticio antes de crear un fiado nuevo.
   * Devuelve `null` si todo OK, o `{error, details}` con razon humana.
   *
   * Reglas:
   *  1. Bloqueo si tiene >= 3 fiados con status VENCIDO.
   *  2. Bloqueo si tiene >= 1 fiado ACTIVO con fechaVence > 60 dias.
   *  3. Bloqueo si suma de saldos ACTIVOs + monto solicitado > creditLimit.
   *
   * Centraliza el patron que estaba inlined en /api/fiados POST,
   * cumpliendo regla critica #1 (no prisma directo en routes).
   */
  async validateForNewFiado(
    tenantId: string,
    customerId: string,
    requestedAmount: number,
    creditLimit: number,
  ): Promise<{ error: string; status: number } | null> {
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

    const [vencidos, muyVencidos, activoAgg] = await Promise.all([
      prisma.fiado.count({
        where: { tenantId, customerId, status: "VENCIDO" },
      }),
      prisma.fiado.count({
        where: {
          tenantId,
          customerId,
          status: "ACTIVO",
          fechaVence: { lt: sixtyDaysAgo },
        },
      }),
      creditLimit > 0
        ? prisma.fiado.aggregate({
            where: { tenantId, customerId, status: "ACTIVO" },
            _sum: { saldo: true },
          })
        : Promise.resolve({ _sum: { saldo: null } }),
    ]);

    if (vencidos >= 3) {
      return {
        error: `Cliente bloqueado: tiene ${vencidos} fiados vencidos sin pagar`,
        status: 400,
      };
    }
    if (muyVencidos > 0) {
      return {
        error: `Cliente bloqueado: tiene ${muyVencidos} fiado(s) vencido(s) hace mas de 60 dias. Debe regularizar antes de crear nuevos.`,
        status: 400,
      };
    }
    if (creditLimit > 0) {
      const totalActivo = activoAgg._sum?.saldo ? Number(activoAgg._sum.saldo) : 0;
      if (totalActivo + requestedAmount > creditLimit) {
        return {
          error: `Cliente supera limite de credito. Limite: S/${creditLimit.toFixed(2)}, Deuda actual: S/${totalActivo.toFixed(2)}, Disponible: S/${(creditLimit - totalActivo).toFixed(2)}`,
          status: 400,
        };
      }
    }

    return null;
  },

  async create(data: {
    tenantId: string;
    customerId: string;
    total: number;
    descripcion?: string;
    fechaVence?: Date;
  }): Promise<DbFiado> {
    const row = await prisma.fiado.create({
      data: {
        tenantId: data.tenantId,
        customerId: data.customerId,
        total: data.total,
        saldo: data.total, // saldo starts equal to total
        descripcion: data.descripcion,
        fechaVence: data.fechaVence,
      },
      include: { cuotas: true },
    });
    return mapFiado(row);
  },

  /**
   * Crea un Fiado DENTRO de una transacción Prisma existente.
   *
   * Audit 2026-05-17 POS↔Fiado integration: usar este método cuando el
   * Fiado debe nacer atómico junto a otra entidad (típicamente una Sale con
   * payment=fiado). Si la Sale revierte, el Fiado también — evita "deuda
   * fantasma" (Sale.payment=fiado registrada sin row en tabla Fiado).
   *
   * NOTA: este método NO valida scoring crediticio. Llamar primero a
   * `validateForNewFiado()` antes de abrir la transacción (no tiene sentido
   * meter esas 3 queries de scoring en el lock de la tx de Sale).
   */
  async createInTransaction(
    tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
    data: {
      tenantId: string;
      customerId: string;
      total: number;
      descripcion?: string;
      fechaVence?: Date;
    },
  ): Promise<DbFiado> {
    const row = await tx.fiado.create({
      data: {
        tenantId: data.tenantId,
        customerId: data.customerId,
        total: data.total,
        saldo: data.total,
        descripcion: data.descripcion,
        fechaVence: data.fechaVence,
      },
      include: { cuotas: true },
    });
    return mapFiado(row);
  },

  async registerPago(
    tenantId: string,
    fiadoId: string,
    monto: number,
    notas?: string,
    caja?: CajaDelCobro,
  ): Promise<(DbFiado & { caja?: ResultadoMovimiento }) | null> {
    // Y1 FIX 2026-05-07: findFirst DENTRO de la tx para evitar race entre 2
    // cobros simultáneos que leían el saldo fuera de tx y calculaban en JS.
    // Ahora usamos `decrement` atómico + re-lectura post-decrement para
    // determinar el estado. Si el saldo baja de 0 (overpayment) se lanza error.
    //
    // Audit 2026-05-17 P1-3: conflictos de Prisma (P2034) ahora propagan como
    // FiadoConflictError para que el handler responda 409 en vez de 503.
    let updated: Awaited<ReturnType<typeof prisma.fiado.findUnique>> | null = null;
    let movCaja: ResultadoMovimiento | undefined;
    try {
      updated = await prisma.$transaction(async (tx) => {
      const fiado = await tx.fiado.findFirst({ where: { id: fiadoId, tenantId } });
      if (!fiado) return null;

      if (fiado.status === "CANCELADO") {
        throw new Error("Fiado cancelado, no se puede cobrar");
      }

      // Cuota primero — si falla, la tx se revierte completa
      await tx.fiadoCuota.create({
        data: { fiadoId, monto, pagadoEn: new Date(), notas },
      });

      // Decrement atómico: DB hace la resta, no JS
      await tx.fiado.update({
        where: { id: fiadoId, tenantId },
        data: { saldo: { decrement: monto } },
      });

      // Re-leer post-decrement para determinar status y detectar overpayment.
      // Audit 2026-05-17 P2-3: findFirst con tenantId (no findUnique sin
      // tenantId) — defense-in-depth si el guard externo se rompe en refactor.
      const afterDecrement = await tx.fiado.findFirst({
        where: { id: fiadoId, tenantId },
        include: { cuotas: { orderBy: { createdAt: "asc" } } },
      });
      if (!afterDecrement) return null;

      const saldoFinal = Number(afterDecrement.saldo);
      if (saldoFinal < -0.01) {
        throw new FiadoOverpaymentError(`El pago excede el saldo en S/${Math.abs(saldoFinal).toFixed(2)}`);
      }

      const final = saldoFinal <= 0.01
        ? await tx.fiado.update({
            where: { id: fiadoId, tenantId },
            data: { status: "PAGADO" },
            include: { cuotas: { orderBy: { createdAt: "asc" } } },
          })
        : afterDecrement;

      // La caja va AL FINAL: es el último lock de la transacción (orden global).
      if (caja) movCaja = await moverCajaEnTx(tx, tenantId, { tipo: "ingreso", monto, metodo: caja.metodo, etiqueta: caja.etiqueta });

      return final;
      });
    } catch (err) {
      if (isPrismaConflict(err)) {
        throw new FiadoConflictError("Race condition detectada — reintentar el pago");
      }
      throw err;
    }

    if (!updated) return null;
    return movCaja ? { ...mapFiado(updated), caja: movCaja } : mapFiado(updated);
  },

  async updateStatus(
    tenantId: string,
    id: string,
    status: "ACTIVO" | "PAGADO" | "VENCIDO" | "CANCELADO"
  ): Promise<DbFiado | null> {
    const result = await prisma.fiado.updateMany({
      where: { id, tenantId },
      data: { status },
    });
    if (result.count === 0) return null;
    const row = await prisma.fiado.findFirst({
      where: { id, tenantId },
      include: { cuotas: { orderBy: { createdAt: "asc" } } },
    }).catch((err) => {
      logger.warn("FiadosDB.updateStatus: update failed", { fiadoId: id, status, err: String(err) });
      return null;
    });
    return row ? mapFiado(row) : null;
  },

  /**
   * Audit 2026-08-26: el PATCH de /api/fiados/[id] sólo aceptaba `status`,
   * así que el compromiso de pago con firma digital (que manda `descripcion`)
   * era rechazado por Zod SIEMPRE — el cajero veía "guardado" porque el
   * caller no revisaba la respuesta y de todos modos imprimía. Este método
   * habilita el otro campo que ese flujo necesita escribir.
   */
  async updateDescripcion(tenantId: string, id: string, descripcion: string): Promise<DbFiado | null> {
    const result = await prisma.fiado.updateMany({
      where: { id, tenantId },
      data: { descripcion },
    });
    if (result.count === 0) return null;
    const row = await prisma.fiado.findFirst({
      where: { id, tenantId },
      include: { cuotas: { orderBy: { createdAt: "asc" } } },
    }).catch((err) => {
      logger.warn("FiadosDB.updateDescripcion: lookup failed", { fiadoId: id, err: String(err) });
      return null;
    });
    return row ? mapFiado(row) : null;
  },

  /**
   * Resumen de fiados activos de un cliente. Centraliza la lógica que
   * antes vivía inline en /api/customers/[phone]/fiado-resumen (regla #1
   * CLAUDE.md). 2 queries paralelas: aggregate + oldest.
   *
   * Audit 2026-05-17 P1-4.
   */
  async resumenByCustomer(
    tenantId: string,
    customerId: string,
  ): Promise<{
    montoPendiente: number;
    cantidadFiados: number;
    diasVencido: number;
    hasFiadosVencidos: boolean;
  }> {
    // VENCIDO también es deuda viva (la más urgente): con sólo ACTIVO, el POS no avisaba
    // «Fiado pendiente» al cliente que más debía cobrarse (08-10).
    const baseWhere = { tenantId, customerId, status: { in: ["ACTIVO" as const, "VENCIDO" as const] } };

    const [agg, oldest] = await Promise.all([
      prisma.fiado.aggregate({
        where: baseWhere,
        _sum: { saldo: true },
        _count: true,
      }),
      prisma.fiado.findFirst({
        where: baseWhere,
        orderBy: { createdAt: "asc" },
        select: { createdAt: true, fechaVence: true },
      }),
    ]);

    const montoPendiente = Number(agg._sum.saldo ?? 0);
    const cantidadFiados = agg._count ?? 0;

    let diasVencido = 0;
    let hasFiadosVencidos = false;

    if (oldest) {
      const now = new Date();
      diasVencido = Math.floor(
        (now.getTime() - oldest.createdAt.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (oldest.fechaVence && oldest.fechaVence < now) {
        hasFiadosVencidos = true;
      }
    }

    return { montoPendiente, cantidadFiados, diasVencido, hasFiadosVencidos };
  },

  /**
   * Cobro masivo atómico sobre N fiados elegidos (regla #1: la transacción vive
   * acá, no en la ruta). tenantId en el where de cada update.
   *
   * Dos formas de pedirlo:
   * - `{ fiadoIds, monto }`: el SERVIDOR reparte el monto del fiado más viejo al
   *   más nuevo, en céntimos, con los saldos leídos DENTRO de la transacción
   *   (`repartirCobroMasivo`, la misma regla que la vista previa). Lo usa la ventana.
   * - `[{ fiadoId, monto }]`: el detalle por fiado (contrato viejo); cada monto
   *   se topa al saldo y se redondea a céntimos (antes un resto de 3,5e-15 del
   *   reparto del navegador anotaba una cuota de S/ 0,00).
   *
   * Con `caja`, lo cobrado entra a la caja abierta en la MISMA transacción: un
   * ingreso por cliente («Cobro de fiado · Rosa Pérez»), como ÚLTIMO lock (orden
   * global fiado → caja, ver `moverCajaEnTx`). Sin caja abierta el cobro igual
   * se guarda y vuelve `caja.sinCaja = true`.
   *
   * Los fiados se bloquean en orden de id, no en el del reparto: dos cobros
   * masivos que se cruzan toman los mismos fiados en el mismo orden.
   *
   * TOCTOU (audit 2026-08-26): cada decrement lleva `saldo >= pago` en el WHERE;
   * si otro cobro ya consumió el saldo, count=0 y se aborta el lote entero
   * (FiadoConflictError → 409 reintentable). FiadoNoCobrableError si un fiado no
   * existe en el negocio o ya no está ACTIVO/VENCIDO.
   */
  async cobroMasivo(
    tenantId: string,
    pedido: PedidoCobroMasivo,
    notas?: string,
    caja?: { metodo: MetodoPago },
  ): Promise<{
    resultados: ResultadoCobroMasivo[];
    /** Suma de lo abonado (a céntimos): lo que entró de verdad. */
    cobrado: number;
    /** Lo pedido que no se cobró porque los fiados debían menos. */
    sobrante: number;
    caja?: { sinCaja: boolean; movimientos: number };
  }> {
    const resultados: ResultadoCobroMasivo[] = [];
    let sobrante = 0;
    let movCaja: { sinCaja: boolean; movimientos: number } | undefined;
    const fiadoIds = Array.isArray(pedido) ? pedido.map((p) => p.fiadoId) : pedido.fiadoIds;

    try {
      await prisma.$transaction(async (tx) => {
        // Una sola lectura (sin N+1), dentro de la tx: valida y arma el reparto.
        // El guard de cada update vuelve a mirar el saldo de verdad.
        const filas = await tx.fiado.findMany({ where: { id: { in: fiadoIds }, tenantId } });
        const porId = new Map(filas.map((f) => [f.id, f]));
        for (const id of fiadoIds) {
          const f = porId.get(id);
          if (!f) throw new FiadoNoCobrableError(`Fiado ${id.slice(-6)} no encontrado`);
          if (f.status !== "ACTIVO" && f.status !== "VENCIDO") {
            throw new FiadoNoCobrableError(`Fiado ${id.slice(-6)} no esta activo`);
          }
        }

        let plan: Array<{ fiadoId: string; pago: number }>;
        if (Array.isArray(pedido)) {
          plan = pedido.map((p) => ({
            fiadoId: p.fiadoId,
            pago: Math.min(aCentimos(p.monto), aCentimos(Number(porId.get(p.fiadoId)?.saldo ?? 0))) / 100,
          }));
        } else {
          const reparto = repartirCobroMasivo(
            filas.map((f) => ({ id: f.id, saldo: Number(f.saldo), createdAt: f.createdAt })),
            pedido.monto,
          );
          plan = reparto.pagos.map(({ fiadoId, pago }) => ({ fiadoId, pago }));
          sobrante = reparto.sobrante;
        }
        const aplicar = plan
          .filter((p) => p.pago >= 0.01)
          .sort((a, b) => (a.fiadoId < b.fiadoId ? -1 : a.fiadoId > b.fiadoId ? 1 : 0));

        for (const { fiadoId, pago } of aplicar) {
          const fiado = porId.get(fiadoId);
          if (!fiado) continue;
          const guard = await tx.fiado.updateMany({
            where: { id: fiadoId, tenantId, status: { in: ["ACTIVO", "VENCIDO"] }, saldo: { gte: pago } },
            data: { saldo: { decrement: pago } },
          });
          if (guard.count === 0) {
            throw new FiadoConflictError(`Fiado ${fiadoId.slice(-6)}: el saldo cambió antes de aplicar el cobro`);
          }
          const despues = await tx.fiado.findFirst({ where: { id: fiadoId, tenantId }, select: { saldo: true } });
          const saldoFinal = despues ? Number(despues.saldo) : 0;
          const status = saldoFinal <= 0.01 ? "PAGADO" : fiado.status;
          if (status !== fiado.status) {
            await tx.fiado.update({ where: { id: fiadoId, tenantId }, data: { status } });
          }
          await tx.fiadoCuota.create({
            data: { fiadoId, monto: pago, pagadoEn: new Date(), notas: notas || "Cobro masivo" },
          });
          resultados.push({ fiadoId, montoPagado: pago, nuevoSaldo: Math.max(0, saldoFinal), status, customerId: fiado.customerId });
        }

        // La caja AL FINAL (último lock): un ingreso por cliente, en céntimos.
        if (caja && resultados.length > 0) {
          const porCliente = new Map<string, number>();
          for (const r of resultados) porCliente.set(r.customerId, (porCliente.get(r.customerId) ?? 0) + aCentimos(r.montoPagado));
          const clientes = await tx.customer.findMany({
            where: { tenantId, phone: { in: [...porCliente.keys()] } },
            select: { phone: true, name: true },
          });
          const nombres = new Map(clientes.map((c) => [c.phone, c.name.trim()]));
          movCaja = { sinCaja: false, movimientos: 0 };
          for (const [customerId, centimos] of porCliente) {
            const mov = await moverCajaEnTx(tx, tenantId, {
              tipo: "ingreso",
              monto: centimos / 100,
              metodo: caja.metodo,
              etiqueta: etiquetaCobroFiado(nombres.get(customerId) || customerId),
            });
            // Sin caja abierta en el primero = sin caja en todos (la toma
            // FOR SHARE del primero la retiene hasta el commit).
            if (mov.sinCaja) { movCaja = { sinCaja: true, movimientos: 0 }; break; }
            movCaja.movimientos += 1;
          }
        }
      });
    } catch (err) {
      if (isPrismaConflict(err)) {
        throw new FiadoConflictError("Race condition detectada — reintentar el cobro");
      }
      throw err;
    }

    const cobrado = resultados.reduce((s, r) => s + aCentimos(r.montoPagado), 0) / 100;
    return { resultados, cobrado, sobrante, ...(movCaja && { caja: movCaja }) };
  },

  /**
   * Collect a payment from a customer applied across their active fiados,
   * oldest-first. Atomic via $transaction. Returns a breakdown of payments
   * applied and any remaining amount (if the collection exceeded the debt).
   */
  async cobrarPorCliente(
    tenantId: string,
    customerId: string,
    monto: number,
    notas?: string,
    caja?: CajaDelCobro,
  ): Promise<{
    totalCobrado: number;
    payments: Array<{ id: string; fiadoId: string; monto: number }>;
    remaining: number;
    caja?: ResultadoMovimiento;
  }> {
    let movCaja: ResultadoMovimiento | undefined;
    // Y2 FIX 2026-05-07: findMany DENTRO de la tx interactiva para que la
    // lectura y escritura sean atómicas. Sin esto, entre el findMany externo
    // y los updates internos otro cobro concurrente podía modificar los mismos
    // fiados resultando en doble-cobro o saldo incorrecto.
    // tenantId en where de cada update: defense in depth multi-tenant.
    //
    // Audit 2026-05-17 P1-3: conflict de Prisma propaga como FiadoConflictError.
    let remaining = monto;
    const payments: Array<{ id: string; fiadoId: string; monto: number }> = [];

    try {
      await prisma.$transaction(async (tx) => {
        // VENCIDO también se debe: antes sólo ACTIVO y un cliente con su
        // fiado vencido daba «No hay fiados activos» (Me deben 08-10).
        const fiados = await tx.fiado.findMany({
          where: { tenantId, customerId, status: { in: ["ACTIVO", "VENCIDO"] } },
          orderBy: { createdAt: "asc" },
        });

        if (fiados.length === 0) return;

        for (const fiado of fiados) {
          if (remaining <= 0) break;
          const saldoLeido = Number(fiado.saldo);
          // A céntimos: 50 − 33.3 deja 3.5e-15 de resto y creaba una cuota de S/ 0.00 en el fiado siguiente.
          const paymentTentativo = Math.round(Math.min(remaining, saldoLeido) * 100) / 100;
          if (paymentTentativo < 0.01) continue;

          // Audit 2026-05-17 B-P0-2 (v2): TOCTOU guard real anti-overpayment.
          //
          // v1 (insuficiente): cambié SET por DECREMENT atómico. Eso mata el
          // "doble write" pero NO el overpayment — si 2 reqs leen saldo=100
          // y ambas calculan payment=30, ambas decrementan 30 y la cuota se
          // registra a fin igual. saldo final OK, pero si N reqs paralelas
          // leen el mismo saldo=100 y aplican >100 en decrements → saldo
          // queda negativo y se cobran cuotas que exceden la deuda.
          //
          // v2 (correcto): updateMany con `where: { saldo: { gte: payment } }`.
          // Prisma traduce a `UPDATE ... WHERE saldo >= payment` y devuelve
          // count=0 si la condición no se cumple (TOCTOU clásico). Sólo
          // creamos la cuota si el update efectivamente aplicó.
          const result = await tx.fiado.updateMany({
            where: {
              id: fiado.id,
              tenantId,
              status: { in: ["ACTIVO", "VENCIDO"] },
              saldo: { gte: paymentTentativo },
            },
            data: { saldo: { decrement: paymentTentativo } },
          });

          if (result.count === 0) {
            // Otro cobro consumió el saldo antes que nosotros — skip y
            // re-evaluar en el siguiente fiado del loop (si quedan).
            continue;
          }

          // Re-leer saldo post-decrement para decidir status (PAGADO si <=0.01)
          const after = await tx.fiado.findFirst({
            where: { id: fiado.id, tenantId },
            select: { saldo: true },
          });
          const saldoFinal = after ? Number(after.saldo) : 0;
          if (saldoFinal <= 0.01) {
            await tx.fiado.update({
              where: { id: fiado.id, tenantId },
              data: { status: "PAGADO" },
            });
          }

          const cuota = await tx.fiadoCuota.create({
            data: {
              fiadoId: fiado.id,
              monto: paymentTentativo,
              pagadoEn: new Date(),
              notas: notas || "Cobro desde POS",
            },
          });

          payments.push({ id: cuota.id, fiadoId: fiado.id, monto: paymentTentativo });
          remaining = Math.round((remaining - paymentTentativo) * 100) / 100;
        }

        // Lo cobrado de verdad (no lo pedido) entra a la caja, como último lock.
        const cobrado = monto - remaining;
        if (caja && cobrado > 0) movCaja = await moverCajaEnTx(tx, tenantId, { tipo: "ingreso", monto: cobrado, metodo: caja.metodo, etiqueta: caja.etiqueta });
      });
    } catch (err) {
      if (isPrismaConflict(err)) {
        throw new FiadoConflictError("Race condition detectada — reintentar el cobro");
      }
      throw err;
    }

    return {
      totalCobrado: monto - remaining,
      payments,
      remaining: Math.max(0, remaining),
      ...(movCaja && { caja: movCaja }),
    };
  },
};
