/**
 * lib/events/dlq/retry-cron.ts
 *
 * Funcion de reintentos para el Dead-Letter Queue.
 * Diseñada para correr como cron job en Vercel o externamente.
 *
 * Caracteristicas:
 *   - Procesa todos los tenants con entradas pendientes (o un tenant especifico)
 *   - Respeta el cap de maxAttempts antes de marcar como "exhausted"
 *   - Es idempotente — seguro ejecutar mas de una vez en paralelo
 *     (Prisma update es atomico por fila)
 *
 * Registro en Vercel (descomentar cuando sea el momento):
 *
 *   // vercel.json
 *   // {
 *   //   "crons": [
 *   //     {
 *   //       "path": "/api/cron/dlq-retry",
 *   //       "schedule": "[STAR]/5 * * * *"  // every 5 min — substitute [STAR] with asterisk
 *   //     }
 *   //   ]
 *   // }
 *
 *   // app/api/cron/dlq-retry/route.ts
 *   // import { NextRequest, NextResponse } from "next/server";
 *   // import { eventBus } from "@/lib/events/bus";
 *   // import { persistentDlq } from "@/lib/events/dlq/index";
 *   // import { runDlqRetries } from "@/lib/events/dlq/retry-cron";
 *   //
 *   // export async function GET(req: NextRequest) {
 *   //   const secret = req.headers.get("x-cron-secret");
 *   //   if (secret !== process.env.CRON_SECRET) {
 *   //     return NextResponse.json({ error: "unauthorized" }, { status: 401 });
 *   //   }
 *   //   const summary = await runDlqRetries(eventBus, persistentDlq);
 *   //   return NextResponse.json(summary);
 *   // }
 */

import { logger } from "@/lib/logger";
import type { DeadLetterQueue, RetryResult } from "./dlq";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface DlqRetryOptions {
  /** Cap de intentos antes de marcar como exhausted (default 5). */
  maxAttempts?: number;
  /**
   * Lista de tenantIds a procesar.
   * Si se omite, dlq.retryPending se llama con tenantId="*" — la implementacion
   * Prisma acepta "*" como "todos los tenants" via query sin filtro de tenant.
   * InMemory no soporta "*" — pasar tenantIds explicitos en tests.
   */
  tenantIds?: string[];
}

export interface DlqRetrySummary {
  processedTenants: number;
  totals: RetryResult;
  durationMs: number;
}

// ─── Interfaz minima del bus ──────────────────────────────────────────────────

export interface PublishableBus {
  publish(event: Parameters<DeadLetterQueue["retryPending"]>[0] extends string ? never : never): Promise<void>;
}

// ─── runDlqRetries ────────────────────────────────────────────────────────────

/**
 * Reintenta los eventos en el DLQ para los tenants indicados.
 *
 * La funcion NO necesita el bus directamente — retryPending() en el DLQ
 * ya tiene el bus inyectado via setRetryBus(). Esta funcion orquesta
 * multi-tenant y agrega el resultado.
 *
 * @param dlq   Instancia del DeadLetterQueue (Prisma o InMemory).
 * @param opts  Opciones de retry — ver DlqRetryOptions.
 */
export async function runDlqRetries(
  dlq: DeadLetterQueue,
  opts: DlqRetryOptions = {},
): Promise<DlqRetrySummary> {
  const start = Date.now();
  const { maxAttempts = 5, tenantIds = ["*"] } = opts;

  const totals: RetryResult = { retried: 0, succeeded: 0, failed: 0, exhausted: 0 };

  logger.info("[dlq/retry-cron] starting retry run", {
    tenantIds,
    maxAttempts,
  });

  for (const tenantId of tenantIds) {
    try {
      const result = await dlq.retryPending(tenantId, { maxAttempts });

      totals.retried += result.retried;
      totals.succeeded += result.succeeded;
      totals.failed += result.failed;
      totals.exhausted += result.exhausted;

      if (result.retried > 0 || result.exhausted > 0) {
        logger.info("[dlq/retry-cron] tenant processed", {
          tenantId,
          ...result,
        });
      }
    } catch (err) {
      // Un tenant no debe tumbar el procesamiento de los demas
      logger.error("[dlq/retry-cron] tenant retry failed", {
        tenantId,
        error: String(err),
      });
    }
  }

  const durationMs = Date.now() - start;

  logger.info("[dlq/retry-cron] run completed", {
    durationMs,
    ...totals,
  });

  return {
    processedTenants: tenantIds.length,
    totals,
    durationMs,
  };
}
