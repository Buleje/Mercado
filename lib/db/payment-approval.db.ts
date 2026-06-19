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
 * MULTI-TENANT: expand phase (ccfffa33) agregó tenantId NULLABLE. Contract
 * phase (multi-tenant-contract-audit) lo convirtió a NOT NULL. El dashboard
 * superadmin /superadmin/pagos-yape pasa tenantId: null para vista global.
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { ensureTable } from "@/lib/db/ensure-table";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PaymentApprovalStatus =
  | "pending"
  | "review_required"
  | "approved"
  | "rejected";

export interface PaymentApproval {
  id: string;
  /**
   * tenantId del tenant dueño de la conversación que generó esta approval.
<<<<<<< Updated upstream
   * CONTRACT PHASE (2026-05-11): la columna es NOT NULL en DB tras 0 rows
   * legacy. Todos los callers pasan tenantId obligatorio desde
   * Conversation.tenantId.
=======
   * Contract phase completada (multi-tenant-contract-audit): NOT NULL en DB.
>>>>>>> Stashed changes
   */
  tenantId: string;
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
  /**
   * tenantId del tenant que origina la approval. CRÍTICO para aislamiento:
   * sin este campo, el superadmin de tenant A puede aprobar pagos de tenant B
   * via la consulta de pendings sin filtro.
   */
  tenantId: string;
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
  /**
   * Filtrar al tenantId. SOLO superadmin de plataforma debe pasar null
   * (vista cross-tenant). Cualquier admin de tenant debe pasar su tenantId.
   */
  tenantId?: string | null;
}

// ─── Bootstrap (CREATE TABLE IF NOT EXISTS) ──────────────────────────────────

let bootstrapDone = false;

async function bootstrap(): Promise<void> {
  if (bootstrapDone) return;
  await ensureTable("PaymentApproval", `
      CREATE TABLE IF NOT EXISTS "PaymentApproval" (
        "id"              TEXT PRIMARY KEY,
        "tenantId"        TEXT NOT NULL,
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
      -- Contract phase (2026-05-11): tenantId NOT NULL aplicado vía Supabase MCP.
      -- ADD COLUMN IF NOT EXISTS sigue idempotente para envs legacy con expand;
      -- el SET NOT NULL queda como migration externa (0 rows actuales, safe).
      ALTER TABLE "PaymentApproval" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
      CREATE INDEX IF NOT EXISTS "PaymentApproval_status_idx"
        ON "PaymentApproval"("status");
      CREATE INDEX IF NOT EXISTS "PaymentApproval_customerPhone_idx"
        ON "PaymentApproval"("customerPhone");
      CREATE INDEX IF NOT EXISTS "PaymentApproval_createdAt_idx"
        ON "PaymentApproval"("createdAt");
      CREATE INDEX IF NOT EXISTS "PaymentApproval_tenantId_idx"
        ON "PaymentApproval"("tenantId");
      CREATE INDEX IF NOT EXISTS "PaymentApproval_tenantId_status_idx"
        ON "PaymentApproval"("tenantId", "status");
    `, "payment-approval");
  bootstrapDone = true;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rowToApproval(r: Record<string, unknown>): PaymentApproval {
  return {
    id: String(r.id),
    tenantId: String(r.tenantId),
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
    // SECURITY 2026-05-06 (audit WhatsApp #12): IDs con CSPRNG en vez de
    // Math.random (~41 bits entropy → predecible). randomUUID = 122 bits.
    const { randomUUID } = await import("crypto");
    const id = `pap_${randomUUID()}`;
     
    await prisma.$executeRawUnsafe(
      `INSERT INTO "PaymentApproval" (
        id, "tenantId", "conversationId", "customerPhone", "expectedAmount", "imageUrl"
      ) VALUES ($1, $2, $3, $4, $5, $6)`,
      id,
      input.tenantId,
      input.conversationId ?? null,
      input.customerPhone,
      input.expectedAmount,
      input.imageUrl,
    );
    const row = await this.getById(id);
    if (!row) throw new Error("PaymentApproval creado pero no recuperable");
    logger.info("[payment-approval] created", {
      id,
      // PII redaction (audit 2026-05-02 #14): only last 6 digits — Ley 29733 PE.
      customerPhone: input.customerPhone.slice(-6),
      expectedAmount: input.expectedAmount,
    });
    return row;
  },

  async getById(id: string): Promise<PaymentApproval | null> {
    await bootstrap();
     
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
    tenantId: string,
  ): Promise<PaymentApproval | null> {
    await bootstrap();
    // Audit 2026-05-02 #4: include 'review_required' in the dedupe lookup.
    // CRITICAL FIX 2026-05-11 (P0-2): scope al tenantId. Antes el customer
    // con phone X en tenant A veía la approval pending del MISMO phone en
    // tenant B → confusión + posible aprobación cross-tenant.
     
    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT * FROM "PaymentApproval"
        WHERE "customerPhone" = $1
          AND "tenantId" = $2
          AND status IN ('pending', 'review_required')
        ORDER BY "createdAt" DESC
        LIMIT 1`,
      customerPhone,
      tenantId,
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

    // SECURITY 2026-05-06 (pentest H002): si el yapeOpCode YA fue usado en
    // otra approval `approved`, marcar como review_required en vez de
    // auto-aprobar. Antes el atacante podía reusar 1 captura real para
    // 5 órdenes — ahora la 2da+ entra en revisión manual.
    if (result.yapeOpCode && nextStatus === "pending") {
       
      const dupes = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM "PaymentApproval"
          WHERE "yapeOpCode" = $1 AND status = 'approved' AND id <> $2
          LIMIT 1`,
        result.yapeOpCode,
        id,
      );
      if (Array.isArray(dupes) && dupes.length > 0) {
        nextStatus = "review_required";
        rejectionReason = `OP de Yape ${result.yapeOpCode} ya fue usada en otra aprobación. Verificación manual requerida.`;
        logger.warn("[payment-approval] OP code reuse detected", {
          id,
          yapeOpCode: result.yapeOpCode,
        });
      }
    }

     
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

  /**
   * Atomic approve. Returns true when the row transitioned from
   * pending/review_required to approved; false if another reviewer (or
   * a duplicate click from the same reviewer) had already finalized it.
   * Callers MUST check the boolean before transitioning Orders or
   * notifying the customer to avoid double-side-effects.
   */
  async approve(id: string, reviewerUsername: string): Promise<boolean> {
    await bootstrap();
     
    const affected = await prisma.$executeRawUnsafe(
      `UPDATE "PaymentApproval"
        SET status      = 'approved',
            "reviewedBy" = $2,
            "reviewedAt" = NOW(),
            "updatedAt"  = NOW()
        WHERE id = $1
          AND status IN ('pending', 'review_required')`,
      id,
      reviewerUsername,
    );
    const transitioned = Number(affected) > 0;
    if (transitioned) {
      logger.info("[payment-approval] approved", { id, reviewer: reviewerUsername });
    } else {
      logger.warn("[payment-approval] approve no-op (already finalized)", {
        id,
        reviewer: reviewerUsername,
      });
    }
    return transitioned;
  },

  /**
   * Atomic reject. Same contract as approve(): returns true on transition,
   * false when the row was already finalized.
   */
  async reject(
    id: string,
    reviewerUsername: string,
    reason: string,
  ): Promise<boolean> {
    await bootstrap();
     
    const affected = await prisma.$executeRawUnsafe(
      `UPDATE "PaymentApproval"
        SET status            = 'rejected',
            "reviewedBy"      = $2,
            "rejectionReason" = $3,
            "reviewedAt"      = NOW(),
            "updatedAt"       = NOW()
        WHERE id = $1
          AND status IN ('pending', 'review_required')`,
      id,
      reviewerUsername,
      reason,
    );
    const transitioned = Number(affected) > 0;
    if (transitioned) {
      logger.info("[payment-approval] rejected", {
        id,
        reviewer: reviewerUsername,
        reason,
      });
    } else {
      logger.warn("[payment-approval] reject no-op (already finalized)", {
        id,
        reviewer: reviewerUsername,
      });
    }
    return transitioned;
  },

  /**
   * Listado para el dashboard del superadmin: todas las que estén
   * `pending` o `review_required`. `sinceMs` opcional para limitar
   * a las últimas N horas/minutos.
   */
  async listPending(opts: ListPendingOpts = {}): Promise<PaymentApproval[]> {
    await bootstrap();
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 500);
    // CRITICAL FIX 2026-05-11 (P0-2): scope opcional al tenantId. Admin de
    // tenant ve sólo sus approvals pending; superadmin de plataforma puede
    // pasar tenantId: null explícitamente para vista global.
    const filterTenant = opts.tenantId !== undefined && opts.tenantId !== null;

    if (opts.sinceMs != null && opts.sinceMs > 0) {
      const since = new Date(Date.now() - opts.sinceMs);
      const sql = filterTenant
        ? `SELECT * FROM "PaymentApproval"
            WHERE status IN ('pending', 'review_required')
              AND "createdAt" >= $1
              AND "tenantId" = $2
            ORDER BY "createdAt" DESC
            LIMIT $3`
        : `SELECT * FROM "PaymentApproval"
            WHERE status IN ('pending', 'review_required')
              AND "createdAt" >= $1
            ORDER BY "createdAt" DESC
            LIMIT $2`;
       
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        sql,
        ...(filterTenant
          ? [since, opts.tenantId as string, limit]
          : [since, limit]),
      );
      return rows.map(rowToApproval);
    }

    const sql = filterTenant
      ? `SELECT * FROM "PaymentApproval"
          WHERE status IN ('pending', 'review_required')
            AND "tenantId" = $1
          ORDER BY "createdAt" DESC
          LIMIT $2`
      : `SELECT * FROM "PaymentApproval"
          WHERE status IN ('pending', 'review_required')
          ORDER BY "createdAt" DESC
          LIMIT $1`;
     
    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      sql,
      ...(filterTenant ? [opts.tenantId as string, limit] : [limit]),
    );
    return rows.map(rowToApproval);
  },
};
