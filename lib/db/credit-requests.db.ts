import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";

/**
 * CreditRequestsDB — solicitudes del vecino para que la bodega le otorgue/aumente
 * su línea de fiado (Frente 3, flujo solicitud→aprobación).
 *
 * Tabla `CreditRequest` fuera de schema.prisma (creada por
 * `scripts/credit-requests-migration.sql`, aplicada por pooler). Acceso 100% raw
 * SQL parametrizado — mismo patrón que Store.benefits. `tenantId` 1er argumento.
 */

export type CreditRequestStatus = "PENDING" | "APPROVED" | "REJECTED";

export type DbCreditRequest = {
  id: string;
  tenantId: string;
  customerId: string;
  customerName: string | null;
  requestedAmount: number | null;
  reason: string | null;
  status: CreditRequestStatus;
  approvedLimit: number | null;
  decidedBy: string | null;
  decisionNote: string | null;
  createdAt: string;
  decidedAt: string | null;
};

type Row = {
  id: string;
  tenantId: string;
  customerId: string;
  customerName: string | null;
  requestedAmount: string | null;
  reason: string | null;
  status: string;
  approvedLimit: string | null;
  decidedBy: string | null;
  decisionNote: string | null;
  createdAt: Date;
  decidedAt: Date | null;
};

function mapRow(r: Row): DbCreditRequest {
  return {
    id: r.id,
    tenantId: r.tenantId,
    customerId: r.customerId,
    customerName: r.customerName,
    requestedAmount: r.requestedAmount != null ? Number(r.requestedAmount) : null,
    reason: r.reason,
    status: (r.status as CreditRequestStatus) ?? "PENDING",
    approvedLimit: r.approvedLimit != null ? Number(r.approvedLimit) : null,
    decidedBy: r.decidedBy,
    decisionNote: r.decisionNote,
    createdAt: r.createdAt.toISOString(),
    decidedAt: r.decidedAt ? r.decidedAt.toISOString() : null,
  };
}

const SELECT = `SELECT id, "tenantId", "customerId", "customerName", "requestedAmount", "reason", "status", "approvedLimit", "decidedBy", "decisionNote", "createdAt", "decidedAt" FROM "CreditRequest"`;

export const CreditRequestsDB = {
  /** Crea una solicitud PENDING. Devuelve el id nuevo. */
  async create(
    tenantId: string,
    input: {
      customerId: string;
      customerName?: string | null;
      requestedAmount?: number | null;
      reason?: string | null;
    },
  ): Promise<string> {
    const id = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO "CreditRequest" (id, "tenantId", "customerId", "customerName", "requestedAmount", "reason", "status")
       VALUES ($1, $2, $3, $4, $5, $6, 'PENDING')`,
      id,
      tenantId,
      input.customerId,
      input.customerName ?? null,
      input.requestedAmount ?? null,
      input.reason ?? null,
    );
    return id;
  },

  /** ¿El cliente ya tiene una solicitud PENDING? (dedup / evitar spam). */
  async hasPending(tenantId: string, customerId: string): Promise<boolean> {
    const rows = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
      `SELECT COUNT(*)::int AS n FROM "CreditRequest" WHERE "tenantId" = $1 AND "customerId" = $2 AND "status" = 'PENDING'`,
      tenantId,
      customerId,
    );
    return Number(rows[0]?.n ?? 0) > 0;
  },

  /** Solicitudes PENDING del tenant (cola del admin), más nuevas primero. */
  async listPending(tenantId: string): Promise<DbCreditRequest[]> {
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      `${SELECT} WHERE "tenantId" = $1 AND "status" = 'PENDING' ORDER BY "createdAt" DESC LIMIT 200`,
      tenantId,
    );
    return rows.map(mapRow);
  },

  /** Solicitudes de un cliente (para mostrarle su estado en /mi-credito). */
  async listByCustomer(
    tenantId: string,
    customerId: string,
    limit = 5,
  ): Promise<DbCreditRequest[]> {
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      `${SELECT} WHERE "tenantId" = $1 AND "customerId" = $2 ORDER BY "createdAt" DESC LIMIT $3`,
      tenantId,
      customerId,
      limit,
    );
    return rows.map(mapRow);
  },

  async getById(tenantId: string, id: string): Promise<DbCreditRequest | null> {
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      `${SELECT} WHERE "tenantId" = $1 AND id = $2 LIMIT 1`,
      tenantId,
      id,
    );
    return rows[0] ? mapRow(rows[0]) : null;
  },

  /**
   * Registra la decisión del dueño. NO toca el CreditProfile — eso lo hace el
   * caller (CreditDB.grantLimit) para mantener la escritura de dinero separada.
   */
  async decide(
    tenantId: string,
    id: string,
    input: {
      status: "APPROVED" | "REJECTED";
      approvedLimit?: number | null;
      decidedBy: string;
      decisionNote?: string | null;
    },
  ): Promise<DbCreditRequest | null> {
    await prisma.$executeRawUnsafe(
      `UPDATE "CreditRequest"
       SET "status" = $1, "approvedLimit" = $2, "decidedBy" = $3, "decisionNote" = $4, "decidedAt" = now()
       WHERE "tenantId" = $5 AND id = $6 AND "status" = 'PENDING'`,
      input.status,
      input.approvedLimit ?? null,
      input.decidedBy,
      input.decisionNote ?? null,
      tenantId,
      id,
    );
    return this.getById(tenantId, id);
  },
};
