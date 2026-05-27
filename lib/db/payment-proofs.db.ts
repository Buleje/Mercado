/**
 * lib/db/payment-proofs.db.ts
 *
 * Pagos manuales (Yape/Plin/transferencia) de aplicaciones para abrir
 * tienda. Brandon mayo 2026: cliente paga vía Yape, sube captura, el
 * superadmin revisa, aprueba o rechaza, y al aprobar el sistema crea
 * el tenant + WhatsApp de bienvenida.
 *
 * SCHEMA EVOLUTION: usamos `CREATE TABLE IF NOT EXISTS` en bootstrap
 * para evitar `prisma migrate` (Brandon ha tenido problemas con
 * DIRECT_URL en su red). El bootstrap corre 1× al levantar el server.
 *
 * Convención del proyecto: queries vía raw SQL. tenantId no aplica
 * acá porque PaymentProof es PRE-tenant (la tienda todavía no existe).
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export type PaymentMethod = "yape" | "plin" | "transfer";
export type PaymentStatus = "pending" | "approved" | "rejected";
export type BillingCycle = "mensual" | "anual";

export interface PaymentProof {
  id: string;
  tenantSlug: string;
  ownerName: string;
  ownerPhone: string;
  ownerEmail: string | null;
  storeName: string;
  category: string;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  direccion: string | null;
  planTier: string;
  billingCycle: BillingCycle;
  amountPEN: number;
  method: PaymentMethod;
  proofUrl: string;
  reference: string | null;
  status: PaymentStatus;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  rejectionReason: string | null;
  whatsappSentAt: Date | null;
  createdTenantId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

let bootstrapDone = false;

async function bootstrap(): Promise<void> {
  if (bootstrapDone) return;
  try {
     
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "PaymentProof" (
        id              TEXT PRIMARY KEY,
        "tenantSlug"    TEXT NOT NULL,
        "ownerName"     TEXT NOT NULL,
        "ownerPhone"    TEXT NOT NULL,
        "ownerEmail"    TEXT,
        "storeName"     TEXT NOT NULL,
        category        TEXT NOT NULL,
        departamento    TEXT,
        provincia       TEXT,
        distrito        TEXT,
        direccion       TEXT,
        "planTier"      TEXT NOT NULL,
        "billingCycle"  TEXT NOT NULL DEFAULT 'mensual',
        "amountPEN"     DECIMAL(12,2) NOT NULL,
        method          TEXT NOT NULL,
        "proofUrl"      TEXT NOT NULL,
        reference       TEXT,
        status          TEXT NOT NULL DEFAULT 'pending',
        "reviewedBy"    TEXT,
        "reviewedAt"    TIMESTAMP(3),
        "rejectionReason" TEXT,
        "whatsappSentAt" TIMESTAMP(3),
        "createdTenantId" TEXT,
        "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS "PaymentProof_status_createdAt_idx"
        ON "PaymentProof"(status, "createdAt" DESC);
      CREATE INDEX IF NOT EXISTS "PaymentProof_tenantSlug_idx"
        ON "PaymentProof"("tenantSlug");
    `);
    bootstrapDone = true;
  } catch (err) {
    logger.error("[payment-proofs] bootstrap failed", { error: String(err) });
    throw err;
  }
}

interface CreateInput {
  tenantSlug: string;
  ownerName: string;
  ownerPhone: string;
  ownerEmail: string | null;
  storeName: string;
  category: string;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  direccion: string | null;
  planTier: string;
  billingCycle: BillingCycle;
  amountPEN: number;
  method: PaymentMethod;
  proofUrl: string;
  reference: string | null;
}

export const PaymentProofsDB = {
  async create(input: CreateInput): Promise<PaymentProof> {
    await bootstrap();
    // SECURITY 2026-05-06 (audit WhatsApp #12): IDs con CSPRNG.
    const { randomUUID } = await import("crypto");
    const id = `pmp_${randomUUID()}`;
     
    await prisma.$executeRawUnsafe(
      `INSERT INTO "PaymentProof" (
        id, "tenantSlug", "ownerName", "ownerPhone", "ownerEmail",
        "storeName", category, departamento, provincia, distrito, direccion,
        "planTier", "billingCycle", "amountPEN", method, "proofUrl", reference
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      id,
      input.tenantSlug,
      input.ownerName,
      input.ownerPhone,
      input.ownerEmail,
      input.storeName,
      input.category,
      input.departamento,
      input.provincia,
      input.distrito,
      input.direccion,
      input.planTier,
      input.billingCycle,
      input.amountPEN,
      input.method,
      input.proofUrl,
      input.reference,
    );
    const row = await this.getById(id);
    if (!row) throw new Error("PaymentProof creado pero no recuperable");
    return row;
  },

  async getById(id: string): Promise<PaymentProof | null> {
    await bootstrap();
     
    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT * FROM "PaymentProof" WHERE id = $1 LIMIT 1`,
      id,
    );
    if (!rows[0]) return null;
    return rowToProof(rows[0]);
  },

  async listPending(): Promise<PaymentProof[]> {
    await bootstrap();
     
    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT * FROM "PaymentProof" WHERE status = 'pending' ORDER BY "createdAt" DESC LIMIT 200`,
    );
    return rows.map(rowToProof);
  },

  async listAll(limit = 200): Promise<PaymentProof[]> {
    await bootstrap();
     
    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT * FROM "PaymentProof" ORDER BY "createdAt" DESC LIMIT $1`,
      limit,
    );
    return rows.map(rowToProof);
  },

  async approve(
    id: string,
    reviewedBy: string,
    createdTenantId: string,
  ): Promise<void> {
    await bootstrap();
     
    await prisma.$executeRawUnsafe(
      `UPDATE "PaymentProof"
        SET status = 'approved',
            "reviewedBy" = $2,
            "reviewedAt" = NOW(),
            "createdTenantId" = $3,
            "updatedAt" = NOW()
        WHERE id = $1`,
      id,
      reviewedBy,
      createdTenantId,
    );
  },

  async reject(
    id: string,
    reviewedBy: string,
    reason: string,
  ): Promise<void> {
    await bootstrap();
     
    await prisma.$executeRawUnsafe(
      `UPDATE "PaymentProof"
        SET status = 'rejected',
            "reviewedBy" = $2,
            "reviewedAt" = NOW(),
            "rejectionReason" = $3,
            "updatedAt" = NOW()
        WHERE id = $1`,
      id,
      reviewedBy,
      reason,
    );
  },

  async markWhatsappSent(id: string): Promise<void> {
    await bootstrap();
     
    await prisma.$executeRawUnsafe(
      `UPDATE "PaymentProof" SET "whatsappSentAt" = NOW(), "updatedAt" = NOW() WHERE id = $1`,
      id,
    );
  },
};

function rowToProof(r: Record<string, unknown>): PaymentProof {
  return {
    id: String(r.id),
    tenantSlug: String(r.tenantSlug),
    ownerName: String(r.ownerName),
    ownerPhone: String(r.ownerPhone),
    ownerEmail: r.ownerEmail == null ? null : String(r.ownerEmail),
    storeName: String(r.storeName),
    category: String(r.category),
    departamento: r.departamento == null ? null : String(r.departamento),
    provincia: r.provincia == null ? null : String(r.provincia),
    distrito: r.distrito == null ? null : String(r.distrito),
    direccion: r.direccion == null ? null : String(r.direccion),
    planTier: String(r.planTier),
    billingCycle: r.billingCycle as BillingCycle,
    amountPEN: Number(r.amountPEN),
    method: r.method as PaymentMethod,
    proofUrl: String(r.proofUrl),
    reference: r.reference == null ? null : String(r.reference),
    status: r.status as PaymentStatus,
    reviewedBy: r.reviewedBy == null ? null : String(r.reviewedBy),
    reviewedAt: r.reviewedAt == null ? null : new Date(r.reviewedAt as string | Date),
    rejectionReason: r.rejectionReason == null ? null : String(r.rejectionReason),
    whatsappSentAt: r.whatsappSentAt == null ? null : new Date(r.whatsappSentAt as string | Date),
    createdTenantId: r.createdTenantId == null ? null : String(r.createdTenantId),
    createdAt: new Date(r.createdAt as string | Date),
    updatedAt: new Date(r.updatedAt as string | Date),
  };
}
