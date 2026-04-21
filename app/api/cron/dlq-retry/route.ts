import { NextRequest, NextResponse } from "next/server";
import { withCronAuth } from "@/lib/cron-auth";
import { logger } from "@/lib/logger";
import { runDlqRetries } from "@/lib/events/dlq/retry-cron";
import { InMemoryDeadLetterQueue } from "@/lib/events/dlq/in-memory-dlq";

// GET /api/cron/dlq-retry
//
// Reintenta eventos que quedaron en el Dead Letter Queue.
// Usa InMemoryDeadLetterQueue por default hasta que la tabla
// DomainEventLog/EventDeadLetter esté migrada (SCHEMA-PROPOSAL
// en lib/events/dlq/SCHEMA-PROPOSAL.prisma).
//
// Sugerencia vercel.json: cada 5 minutos
// Autorización: Bearer <CRON_SECRET>

const dlq = new InMemoryDeadLetterQueue();

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
