/**
 * lib/db/payment-approval.db.ts
 *
 * Yape Vision — aprobaciones automáticas de pagos.
 *
 * Flujo:
 *  1. Cliente manda captura de Yape por WhatsApp.
 *  2. `app/api/whatsapp/yape-capture` crea PaymentApproval pending.
 *  3. Background: `lib/ai/yape-vision.extractYapePayment` corre Claude
 *     Sonnet 4.6 Vision y llena detectedAmount/yapeOpCode/yapeLast4/yapeDate.
 *  4. Si delta detectedAmount vs expectedAmount > 5% → review_required.
 *  5. Superadmin aprueba/rechaza desde el dashboard.
 *
 * SCHEMA EVOLUTION: usa `CREATE TABLE IF NOT EXISTS` en bootstrap (mismo
 * patrón que `payment-proofs.db.ts`). Brandon ha tenido problemas con
 * DIRECT_URL en su red — preferimos raw SQL self-bootstrap para no
 * depender de `prisma migrate deploy`. La migration .sql existe igual
 * en `prisma/migrations/20260502120000_add_payment_approval/` para
 * cuando se pueda correr `migrate deploy` en una red estable.
 *
 * NO TENANT: PaymentApproval es global del SaaS. La IA cruza tenants y
 * el equipo Buleje revisa todas las dudas en un solo dashboard.
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PaymentApprovalStatus =
  | "pending"
  | "review_required"
  | "approved"
  | "rejected";

export interface PaymentApproval {
  id: string;
  conversationId: string | null;
  customerPhone: string;
  expectedAmount: number;
  detectedAmount: number | null;
  imageUrl: string;
  visionResponse: Record<string, unknown> | null;
  yapeOpCode: string | null;
  yapeLast4: string | null;
  yapeDate: Date | null;
  status: PaymentApprovalStatus;
  rejectionReason: string | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface CreateInput {
  customerPhone: string;
  expectedAmount: number;
  imageUrl: string;
  conversationId?: string | null;
}

interface VisionResultInput {
  detectedAmount: number | null;
  yapeOpCode: string | null;
  yapeLast4: string | null;
  yapeDate: Date | null;
  visionResponse: Record<string, unknown>;
}

interface ListPendingOpts {
  limit?: number;
  /** ms desde Date.now() para filtrar `createdAt >= now - sinceMs`. */
  sinceMs?: number;
}

// ─── Bootstrap (CREATE TABLE IF NOT EXISTS) ──────────────────────────────────

let bootstrapDone = false;

async function bootstrap(): Promise<void> {
  if (bootstrapDone) return;
  try {
    // eslint-disable-next-line no-restricted-properties -- bootstrap pre-migration (global, no tenant)
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "PaymentApproval" (
        "id"              TEXT PRIMARY KEY,
        "conversationId"  TEXT,
        "customerPhone"   TEXT NOT NULL,
        "expectedAmount"  DECIMAL(12,2) NOT NULL,
        "detectedAmount"  DECIMAL(12,2),
        "imageUrl"        TEXT NOT NULL,
        "visionResponse"  JSONB,
        "yapeOpCode"      TEXT,
        "yapeLast4"       TEXT,
        "yapeDate"        TIMESTAMP(3),
        "status"          TEXT NOT NULL DEFAULT 'pending',
        "rejectionReason" TEXT,
        "reviewedBy"      TEXT,
        "reviewedAt"      TIMESTAMP(3),
        "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS "PaymentApproval_status_idx"
        ON "PaymentApproval"("status");
      CREATE INDEX IF NOT EXISTS "PaymentApproval_customerPhone_idx"
        ON "PaymentApproval"("customerPhone");
      CREATE INDEX IF NOT EXISTS "PaymentApproval_createdAt_idx"
        ON "PaymentApproval"("createdAt");
    `);
    bootstrapDone = true;
  } catch (err) {
    logger.error("[payment-approval] bootstrap failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rowToApproval(r: Record<string, unknown>): PaymentApproval {
  return {
    id: String(r.id),
    conversationId: r.conversationId == null ? null : String(r.conversationId),
    customerPhone: String(r.customerPhone),
    expectedAmount: Number(r.expectedAmount),
    detectedAmount: r.detectedAmount == null ? null : Number(r.detectedAmount),
    imageUrl: String(r.imageUrl),
    visionResponse:
      r.visionResponse == null
        ? null
        : (r.visionResponse as Record<string, unknown>),
    yapeOpCode: r.yapeOpCode == null ? null : String(r.yapeOpCode),
    yapeLast4: r.yapeLast4 == null ? null : String(r.yapeLast4),
    yapeDate: r.yapeDate == null ? null : new Date(r.yapeDate as string | Date),
    status: r.status as PaymentApprovalStatus,
    rejectionReason:
      r.rejectionReason == null ? null : String(r.rejectionReason),
    reviewedBy: r.reviewedBy == null ? null : String(r.reviewedBy),
    reviewedAt:
      r.reviewedAt == null ? null : new Date(r.reviewedAt as string | Date),
    createdAt: new Date(r.createdAt as string | Date),
    updatedAt: new Date(r.updatedAt as string | Date),
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const PaymentApprovalDb = {
  /**
   * Crea una nueva approval `pending`. El call-site debe haber resuelto
   * `expectedAmount` desde la conversación (ej. total del carrito).
   */
  async create(input: CreateInput): Promise<PaymentApproval> {
    await bootstrap();
    const id = `pap_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    // eslint-disable-next-line no-restricted-properties -- pre-migration self-bootstrap
    await prisma.$executeRawUnsafe(
      `INSERT INTO "PaymentApproval" (
        id, "conversationId", "customerPhone", "expectedAmount", "imageUrl"
      ) VALUES ($1, $2, $3, $4, $5)`,
      id,
      input.conversationId ?? null,
      input.customerPhone,
      input.expectedAmount,
      input.imageUrl,
    );
    const row = await this.getById(id);
    if (!row) throw new Error("PaymentApproval creado pero no recuperable");
    logger.info("[payment-approval] created", {
      id,
      customerPhone: input.customerPhone,
      expectedAmount: input.expectedAmount,
    });
    return row;
  },

  async getById(id: string): Promise<PaymentApproval | null> {
    await bootstrap();
    // eslint-disable-next-line no-restricted-properties -- pre-migration self-bootstrap
    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT * FROM "PaymentApproval" WHERE id = $1 LIMIT 1`,
      id,
    );
    if (!rows[0]) return null;
    return rowToApproval(rows[0]);
  },

  /**
   * Última approval pending de un teléfono. Sirve para idempotency F2:
   * si llega una segunda imagen mientras todavía estamos validando la
   * primera, evitamos duplicar approvals.
   */
  async findByPhonePending(
    customerPhone: string,
  ): Promise<PaymentApproval | null> {
    await bootstrap();
    // eslint-disable-next-line no-restricted-properties -- pre-migration self-bootstrap
    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT * FROM "PaymentApproval"
        WHERE "customerPhone" = $1 AND status = 'pending'
        ORDER BY "createdAt" DESC
        LIMIT 1`,
      customerPhone,
    );
    if (!rows[0]) return null;
    return rowToApproval(rows[0]);
  },

  /**
   * Persiste el resultado de Vision API. Calcula delta vs expectedAmount
   * y si > 5% marca review_required automáticamente. Si Vision no pudo
   * extraer monto (`detectedAmount: null`) → review_required con razón.
   */
  async setVisionResult(id: string, result: VisionResultInput): Promise<void> {
    await bootstrap();

    const existing = await this.getById(id);
    if (!existing) {
      logger.warn("[payment-approval] setVisionResult: id not found", { id });
      return;
    }

    // BUG-1 fix (audit 2026-05-02): if the superadmin already approved
    // or rejected this record, a late Vision callback would otherwise
    // overwrite the final status. Skip silently with a warn log.
    if (existing.status === "approved" || existing.status === "rejected") {
      logger.warn(
        "[payment-approval] setVisionResult: record already finalized, skipping",
        { id, currentStatus: existing.status },
      );
      return;
    }

    // Compute next status from delta
    let nextStatus: PaymentApprovalStatus = "pending";
    let rejectionReason: string | null = null;

    if (result.detectedAmount == null) {
      nextStatus = "review_required";
      rejectionReason =
        "IA no pudo extraer el monto (imagen ilegible o no es Yape)";
    } else {
      const delta = Math.abs(result.detectedAmount - existing.expectedAmount);
      const pct =
        existing.expectedAmount > 0
          ? delta / existing.expectedAmount
          : delta > 0
            ? 1
            : 0;
      if (pct > 0.05) {
        nextStatus = "review_required";
        rejectionReason = `Diferencia de monto: esperado S/${existing.expectedAmount.toFixed(2)} vs detectado S/${result.detectedAmount.toFixed(2)} (${(pct * 100).toFixed(1)}%)`;
      }
    }

    // eslint-disable-next-line no-restricted-properties -- pre-migration self-bootstrap
    await prisma.$executeRawUnsafe(
      `UPDATE "PaymentApproval"
        SET "detectedAmount"  = $2,
            "yapeOpCode"      = $3,
            "yapeLast4"       = $4,
            "yapeDate"        = $5,
            "visionResponse"  = $6::jsonb,
            "status"          = $7,
            "rejectionReason" = COALESCE($8, "rejectionReason"),
            "updatedAt"       = NOW()
        WHERE id = $1
          AND status IN ('pending', 'review_required')`,
      id,
      result.detectedAmount,
      result.yapeOpCode,
      result.yapeLast4,
      result.yapeDate,
      JSON.stringify(result.visionResponse),
      nextStatus,
      rejectionReason,
    );

    logger.info("[payment-approval] vision result saved", {
      id,
      status: nextStatus,
      detectedAmount: result.detectedAmount,
      delta:
        result.detectedAmount == null
          ? null
          : Math.abs(result.detectedAmount - existing.expectedAmount),
    });
  },

  async approve(id: string, reviewerUsername: string): Promise<void> {
    await bootstrap();
    // eslint-disable-next-line no-restricted-properties -- pre-migration self-bootstrap
    await prisma.$executeRawUnsafe(
      `UPDATE "PaymentApproval"
        SET status      = 'approved',
            "reviewedBy" = $2,
            "reviewedAt" = NOW(),
            "updatedAt"  = NOW()
        WHERE id = $1`,
      id,
      reviewerUsername,
    );
    logger.info("[payment-approval] approved", { id, reviewer: reviewerUsername });
  },

  async reject(
    id: string,
    reviewerUsername: string,
    reason: string,
  ): Promise<void> {
    await bootstrap();
    // eslint-disable-next-line no-restricted-properties -- pre-migration self-bootstrap
    await prisma.$executeRawUnsafe(
      `UPDATE "PaymentApproval"
        SET status            = 'rejected',
            "reviewedBy"      = $2,
            "rejectionReason" = $3,
            "reviewedAt"      = NOW(),
            "updatedAt"       = NOW()
        WHERE id = $1`,
      id,
      reviewerUsername,
      reason,
    );
    logger.info("[payment-approval] rejected", {
      id,
      reviewer: reviewerUsername,
      reason,
    });
  },

  /**
   * Listado para el dashboard del superadmin: todas las que estén
   * `pending` o `review_required`. `sinceMs` opcional para limitar
   * a las últimas N horas/minutos.
   */
  async listPending(opts: ListPendingOpts = {}): Promise<PaymentApproval[]> {
    await bootstrap();
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 500);

    if (opts.sinceMs != null && opts.sinceMs > 0) {
      const since = new Date(Date.now() - opts.sinceMs);
      // eslint-disable-next-line no-restricted-properties -- pre-migration self-bootstrap
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT * FROM "PaymentApproval"
          WHERE status IN ('pending', 'review_required')
            AND "createdAt" >= $1
          ORDER BY "createdAt" DESC
          LIMIT $2`,
        since,
        limit,
      );
      return rows.map(rowToApproval);
    }

    // eslint-disable-next-line no-restricted-properties -- pre-migration self-bootstrap
    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT * FROM "PaymentApproval"
        WHERE status IN ('pending', 'review_required')
        ORDER BY "createdAt" DESC
        LIMIT $1`,
      limit,
    );
    return rows.map(rowToApproval);
  },
};
