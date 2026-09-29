/**
 * lib/db/cash-registers-movements.db.ts
 *
 * Audit project-wide 2026-05-19 — elimina acceso prisma.* directo en
 * app/api/cash-registers/movements/route.ts.
 *
 * Encapsula:
 *   - Verificación ownership de caja (findFirst con tenantId)
 *   - Búsqueda de caja abierta del tenant
 *   - Creación de movimiento manual (cashMovement.create)
 *   - Listado de movimientos de una caja (findMany)
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { ConflictError } from "@/lib/api-error";

/**
 * La caja se cerró mientras llegaba el movimiento (F4): no se anota en una caja
 * cerrada. 409 por `toErrorPayload`; el POS lo registra y sigue.
 */
export class CajaNoAbiertaError extends ConflictError {
  constructor() {
    super("La caja ya está cerrada: el movimiento no se anotó. Abre una caja y vuelve a intentarlo.");
    this.name = "CajaNoAbiertaError";
  }
}

export type DbCashMovementRecord = {
  id: string;
  cashRegisterId: string;
  type: string;
  amount: number;
  method: string;
  description: string;
  createdAt: Date;
};

function mapMovement(r: {
  id: string;
  cashRegisterId: string;
  type: string;
  amount: unknown;
  method: string;
  description: string | null;
  createdAt: Date;
}): DbCashMovementRecord {
  return {
    id: r.id,
    cashRegisterId: r.cashRegisterId,
    type: r.type,
    amount: Number(r.amount),
    method: r.method,
    description: r.description ?? "",
    createdAt: r.createdAt,
  };
}

export const CashRegistersMovementsDB = {
  /**
   * Verifica que la caja existe, pertenece al tenant y está abierta.
   * Retorna el id de la caja si es válida; null si no existe o no es del tenant.
   */
  async findOpenRegisterById(
    cashRegisterId: string,
    tenantId: string,
  ): Promise<{ id: string } | null> {
    return prisma.cashRegister.findFirst({
      where: { id: cashRegisterId, tenantId, status: "abierta" },
      select: { id: true },
    });
  },

  /**
   * Busca la caja abierta actual del tenant.
   * Retorna null si no hay ninguna abierta.
   */
  async findCurrentOpenRegister(tenantId: string): Promise<{ id: string } | null> {
    return prisma.cashRegister.findFirst({
      where: { tenantId, status: "abierta" },
      select: { id: true },
    });
  },

  /**
   * Verifica ownership de caja (sin requerir que esté abierta).
   * Usado para el guard de seguridad cross-tenant en GET.
   */
  async verifyOwnership(cashRegisterId: string, tenantId: string): Promise<boolean> {
    const reg = await prisma.cashRegister.findFirst({
      where: { id: cashRegisterId, tenantId },
      select: { id: true },
    });
    return !!reg;
  },

  /**
   * Crea un movimiento manual (ingreso o egreso) en una caja.
   *
   * Con la caja tomada en `FOR SHARE` (F4): la ruta ya verificó que estaba
   * abierta, pero entre esa lectura y el INSERT un cierre podía confirmarse, y el
   * movimiento caía en la caja cerrada. Ahora, si la cerraron, `CajaNoAbiertaError`.
   */
  async createMovement(
    tenantId: string,
    data: {
      cashRegisterId: string;
      type: "ingreso" | "egreso";
      amount: number;
      method: string;
      description: string;
    },
  ): Promise<DbCashMovementRecord> {
    if (!tenantId) throw new Error("tenantId is required");
    const row = await prisma.$transaction(async (tx) => {
      const caja = await CashRegistersMovementsDB.bloquearCajaParaAnotarEnTx(tx, tenantId, data.cashRegisterId);
      if (caja?.status !== "abierta") throw new CajaNoAbiertaError();
      return tx.cashMovement.create({ data });
    });
    return mapMovement(row);
  },

  /*
   * ── El lock de la caja (F4, 3ª pasada de seguridad de ADR-448) ─────────────
   *
   * Antes nada bloqueaba la fila de la caja: el cierre leía los movimientos sin
   * lock, y un movimiento que se confirmaba en ese instante quedaba fuera del
   * esperado (o entraba en una caja ya cerrada). Arqueo descuadrado por el monto
   * exacto. Medido contra la base real: esperado 0 con un ingreso de 150 en
   * curso (`__tests__/caja-cierre-carrera-db.test.ts`).
   *
   * Dos fuerzas de lock, a propósito:
   *   · quien ANOTA toma `FOR SHARE` — choca con el cierre (`FOR UPDATE`) pero no
   *     con otro que anota: dos adelantos a la vez no se esperan entre sí, y las
   *     ventas del POS (cuyo INSERT sólo toma `FOR KEY SHARE` por la FK) tampoco;
   *   · el CIERRE toma `FOR UPDATE` — espera a todo el que está anotando (incluso
   *     a un INSERT suelto, por la FK) y hace esperar a todo el que llega.
   *
   * ORDEN GLOBAL: la caja es SIEMPRE el último lock de una transacción, y el
   * cierre no toma ningún otro. Ver `lib/adelantos/movimiento-caja.ts`.
   */

  /**
   * La caja abierta del tenant, BLOQUEADA para anotar (`FOR SHARE`) dentro de la
   * transacción de quien llama. Si un cierre la tiene tomada, espera; cuando el
   * cierre confirma, Postgres re-evalúa el `status` sobre la fila nueva y la
   * caja ya no califica: devuelve `null` (el movimiento no entra en una caja
   * cerrada). El orden por apertura es para que dos abiertas (no debería haber)
   * den siempre la misma.
   */
  async bloquearCajaAbiertaEnTx(tx: Prisma.TransactionClient, tenantId: string): Promise<{ id: string } | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const filas = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "CashRegister"
       WHERE "tenantId" = ${tenantId} AND "status" = 'abierta'
       ORDER BY "openedAt" DESC, "id" DESC
       LIMIT 1
       FOR SHARE
    `;
    return filas[0] ?? null;
  },

  /**
   * UNA caja por id, bloqueada para anotar (`FOR SHARE`): el mismo lock que
   * `bloquearCajaAbiertaEnTx`, para los escritores que ya saben en qué caja
   * anotan (venta del POS, movimiento manual, arqueo, asistente). Devuelve el
   * `status` RELEÍDO bajo el lock: si un cierre la tenía, es el de después del
   * cierre, y quien llama no anota en una caja cerrada.
   *
   * `tenantId` obligatorio y en el WHERE: una caja de otro negocio da `null`,
   * igual que una que no existe.
   */
  async bloquearCajaParaAnotarEnTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    cashRegisterId: string,
  ): Promise<{ status: string } | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const filas = await tx.$queryRaw<{ status: string }[]>`
      SELECT "status"::text AS status FROM "CashRegister" WHERE "id" = ${cashRegisterId} AND "tenantId" = ${tenantId} FOR SHARE
    `;
    return filas[0] ?? null;
  },

  /**
   * La caja a cerrar, BLOQUEADA en exclusiva (`FOR UPDATE`). Lo primero que hace
   * el cierre: después de esto, lo que lee de movimientos es lo que hay — nadie
   * puede estar anotando a medias ni anotar hasta que confirme. `false` si la caja
   * no existe en este negocio.
   */
  async bloquearCajaParaCerrarEnTx(tx: Prisma.TransactionClient, tenantId: string, cashRegisterId: string): Promise<boolean> {
    if (!tenantId) throw new Error("tenantId is required");
    const filas = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "CashRegister" WHERE "id" = ${cashRegisterId} AND "tenantId" = ${tenantId} FOR UPDATE
    `;
    return filas.length > 0;
  },

  /** `createMovement` dentro de la transacción de quien llama (ver arriba). */
  async createMovementEnTx(
    tx: Prisma.TransactionClient,
    data: { cashRegisterId: string; type: "ingreso" | "egreso"; amount: number; method: string; description: string },
  ): Promise<DbCashMovementRecord> {
    const row = await tx.cashMovement.create({ data });
    return mapMovement(row);
  },

  /**
   * Lista movimientos de una caja, orden descendente, max 100.
   */
  async listByCashRegister(
    cashRegisterId: string,
  ): Promise<DbCashMovementRecord[]> {
    const rows = await prisma.cashMovement.findMany({
      where: { cashRegisterId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return rows.map(mapMovement);
  },
};
