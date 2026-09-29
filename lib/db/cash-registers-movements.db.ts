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
   */
  async createMovement(data: {
    cashRegisterId: string;
    type: "ingreso" | "egreso";
    amount: number;
    method: string;
    description: string;
  }): Promise<DbCashMovementRecord> {
    const row = await prisma.cashMovement.create({ data });
    return mapMovement(row);
  },

  /**
   * La caja abierta del tenant, leída DENTRO de la transacción de quien llama
   * (ADR-448): el alta de un adelanto y su movimiento se escriben juntos, así
   * no hay un instante con el adelanto guardado y la caja sin anotar.
   */
  async findCurrentOpenRegisterEnTx(tx: Prisma.TransactionClient, tenantId: string): Promise<{ id: string } | null> {
    if (!tenantId) throw new Error("tenantId is required");
    return tx.cashRegister.findFirst({ where: { tenantId, status: "abierta" }, select: { id: true } });
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
