import { NextRequest, NextResponse } from "next/server";
import { withCronAuth } from "@/lib/cron-auth";
import { logger } from "@/lib/logger";
import { runDlqRetries } from "@/lib/events/dlq/retry-cron";
import { PrismaDeadLetterQueue } from "@/lib/events/dlq/prisma-dlq";

// GET /api/cron/dlq-retry
//
// Reintenta eventos del Dead Letter Queue.
// SECURITY 2026-05-07 (audit P0-2 production): migrado de InMemoryDeadLetterQueue
// a PrismaDeadLetterQueue. Antes el DLQ vivía en RAM del proceso Vercel — cada
// cold start o restart por deploy borraba todos los eventos pendientes de retry.
// Eventos críticos (pagos, notificaciones, webhooks) se perdían silenciosamente.
//
// Tabla: EventDeadLetter (migration 20260507085127_add_event_dead_letter).
// Sugerencia vercel.json: cada 5 minutos
// Autorización: Bearer <CRON_SECRET>

const dlq = new PrismaDeadLetterQueue();

async function handler(_req: NextRequest): Promise<NextResponse> {
  try {
    const summary = await runDlqRetries(dlq, { maxAttempts: 5 });
    logger.info("[cron:dlq-retry] summary", summary as unknown as Record<string, unknown>);
    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    logger.error("[cron:dlq-retry] failed", { error: String(err) });
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export const GET = withCronAuth("dlq-retry", handler);
