/**
 * Worker Router — /api/workers/[job]
 *
 * Endpoint interno que procesa jobs background encolados por lib/queue.ts.
 * NO es una API pública — está protegido por x-worker-secret.
 *
 * Cada job type delega a su handler en lib/workers/*.worker.ts.
 * El retry con backoff exponencial se maneja en lib/queue.ts#retry().
 *
 * Flujo:
 *   queue.enqueue("send-email", payload)
 *     → fetch POST /api/workers/send-email  { envelope }
 *       → workerHandlers["send-email"](envelope)
 *         → éxito: 200 { ok: true }
 *         → fallo:  queue.retry(envelope)  →  re-fetch con attempt+1
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyWorkerSecret, JobEnvelopeSchema, type JobType } from "@/lib/queue";
import { logger } from "@/lib/logger";

// ── Importar handlers ──────────────────────────────────────────────────────────

import { handleSendEmail } from "@/lib/workers/send-email.worker";
import { handleGeneratePdf } from "@/lib/workers/generate-pdf.worker";
import { handleSendWhatsapp } from "@/lib/workers/send-whatsapp.worker";
import { handleSendPushNotification } from "@/lib/workers/send-push-notification.worker";
import { handleLogActivity } from "@/lib/workers/log-activity.worker";

// ── Registro de handlers ───────────────────────────────────────────────────────

type WorkerHandler = (envelope: z.infer<typeof JobEnvelopeSchema>) => Promise<void>;

const WORKER_HANDLERS: Record<JobType, WorkerHandler> = {
  "send-email": handleSendEmail,
  "generate-pdf": handleGeneratePdf,
  "send-whatsapp": handleSendWhatsapp,
  "send-push-notification": handleSendPushNotification,
  "log-activity": handleLogActivity,
};

// ── Timeout por defecto (ms) ───────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 30_000;

// ── Route Handler ──────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ job: string }> },
) {
  // 1. Verificar secret interno
  if (!verifyWorkerSecret(req)) {
    logger.warn("[worker-router] Unauthorized attempt", {
      path: req.nextUrl.pathname,
      ip: req.headers.get("x-forwarded-for") ?? "unknown",
    });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Resolver parámetro de ruta (Next.js 15+ params son async)
  const { job } = await context.params;

  // 3. Verificar que el job type existe
  const handler = WORKER_HANDLERS[job as JobType];
  if (!handler) {
    logger.warn("[worker-router] Unknown job type", { job });
    return NextResponse.json({ error: "Unknown job type", job }, { status: 400 });
  }

  // 4. Parsear y validar el envelope
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = JobEnvelopeSchema.safeParse(body);
  if (!parsed.success) {
    logger.warn("[worker-router] Invalid envelope", {
      job,
      issues: parsed.error.issues,
    });
    return NextResponse.json(
      { error: "Invalid envelope", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const envelope = parsed.data;

  // Verificar consistencia: el job en la URL debe coincidir con el envelope
  if (envelope.type !== job) {
    logger.warn("[worker-router] Job type mismatch", {
      urlJob: job,
      envelopeType: envelope.type,
      jobId: envelope.jobId,
    });
    return NextResponse.json({ error: "Job type mismatch" }, { status: 400 });
  }

  logger.info("[worker-router] Processing job", {
    jobId: envelope.jobId,
    jobType: envelope.type,
    attempt: envelope.attempt,
    maxAttempts: envelope.maxAttempts,
    tenantId: String(envelope.payload.tenantId ?? ""),
  });

  // 5. Ejecutar con timeout
  const timeoutMs =
    Number(process.env.WORKER_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);

  try {
    await Promise.race([
      handler(envelope),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Worker timeout after ${timeoutMs}ms`)),
          timeoutMs,
        ),
      ),
    ]);

    logger.info("[worker-router] Job completed", {
      jobId: envelope.jobId,
      jobType: envelope.type,
      attempt: envelope.attempt,
    });

    return NextResponse.json({
      ok: true,
      jobId: envelope.jobId,
      attempt: envelope.attempt,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    logger.error("[worker-router] Job failed", {
      jobId: envelope.jobId,
      jobType: envelope.type,
      attempt: envelope.attempt,
      maxAttempts: envelope.maxAttempts,
      error: errorMessage,
    });

    // El retry lo lanza el handler (via queue.retry) o el router como fallback
    // Retornamos 200 para que Vercel no reintente por su cuenta (no es webhook)
    return NextResponse.json({
      ok: false,
      jobId: envelope.jobId,
      attempt: envelope.attempt,
      error: errorMessage,
      willRetry: envelope.attempt < envelope.maxAttempts,
    });
  }
}
