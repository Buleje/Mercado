/**
 * Background Job Queue — Vercel Serverless Edition
 *
 * El patrón fire-and-forget original perdía jobs silenciosamente porque:
 *   1. Los handlers se registraban en memoria (cada invocación es un proceso nuevo)
 *   2. setTimeout para backoff se cancela cuando el runtime de Vercel congela el proceso
 *
 * Solución: cada job type tiene su propio route handler en /api/workers/[job].
 * El enqueue hace un fetch interno a ese endpoint (fire-and-forget verdadero).
 * El retry lo implementa el worker endpoint llamándose a sí mismo con X-Retry-Count.
 *
 * Migración futura a Vercel Queues / SQS / BullMQ:
 *   Solo cambiar la función `dispatch()` — todos los callers quedan intactos.
 *
 * Uso:
 *   import { queue } from "@/lib/queue";
 *   await queue.enqueue("send-email", { to: "user@example.com", subject: "...", tenantId });
 *   await queue.enqueue("send-push-notification", { phone, title, body, tenantId });
 */

import { logger } from "@/lib/logger";
import { z } from "zod";

// ── Tipos de job ──────────────────────────────────────────────────────────────

export type JobType =
  | "send-email"
  | "generate-pdf"
  | "send-whatsapp"
  | "send-push-notification"
  | "log-activity";

// ── Payloads tipados por job ──────────────────────────────────────────────────

export const EmailPayloadSchema = z.object({
  tenantId: z.string(),
  to: z.string().email(),
  subject: z.string(),
  html: z.string(),
  /** Subtipo para logging — "welcome", "order-confirmation", "invoice", etc. */
  emailType: z.string().optional(),
});
export type EmailPayload = z.infer<typeof EmailPayloadSchema>;

export const PdfPayloadSchema = z.object({
  tenantId: z.string(),
  /** Subtipo: "invoice", "order-receipt", "stock-report", etc. */
  pdfType: z.string(),
  /** Parámetros específicos del documento — el worker los interpreta */
  data: z.record(z.string(), z.unknown()),
  /** Email destino para enviar el PDF generado (opcional) */
  sendTo: z.string().email().optional(),
});
export type PdfPayload = z.infer<typeof PdfPayloadSchema>;

export const WhatsappPayloadSchema = z.object({
  tenantId: z.string(),
  phone: z.string(),
  message: z.string(),
});
export type WhatsappPayload = z.infer<typeof WhatsappPayloadSchema>;

export const PushPayloadSchema = z.object({
  tenantId: z.string(),
  /** Enviar a un teléfono específico o broadcast a todos */
  phone: z.string().optional(),
  title: z.string(),
  body: z.string(),
  url: z.string().optional(),
  icon: z.string().optional(),
});
export type PushPayload = z.infer<typeof PushPayloadSchema>;

export const ActivityPayloadSchema = z.object({
  tenantId: z.string(),
  action: z.string(),
  entity: z.string(),
  detail: z.string(),
  entityId: z.string().optional(),
  user: z.string().default("system"),
  requestId: z.string().optional(),
});
export type ActivityPayload = z.infer<typeof ActivityPayloadSchema>;

// Mapa de JobType → schema de payload
export const JOB_SCHEMAS = {
  "send-email": EmailPayloadSchema,
  "generate-pdf": PdfPayloadSchema,
  "send-whatsapp": WhatsappPayloadSchema,
  "send-push-notification": PushPayloadSchema,
  "log-activity": ActivityPayloadSchema,
} as const satisfies Record<JobType, z.ZodTypeAny>;

// ── Envelope del job (lo que viaja en el body del fetch interno) ───────────────

export const JobEnvelopeSchema = z.object({
  jobId: z.string(),
  type: z.enum([
    "send-email",
    "generate-pdf",
    "send-whatsapp",
    "send-push-notification",
    "log-activity",
  ]),
  payload: z.record(z.string(), z.unknown()),
  attempt: z.number().int().min(1).default(1),
  maxAttempts: z.number().int().min(1).max(5).default(3),
  enqueuedAt: z.string(),
});
export type JobEnvelope = z.infer<typeof JobEnvelopeSchema>;

// ── Resultado de ejecución ─────────────────────────────────────────────────────

export type JobResult =
  | { ok: true; jobId: string; attempt: number }
  | { ok: false; jobId: string; attempt: number; error: string; willRetry: boolean };

// ── Generador de IDs ──────────────────────────────────────────────────────────

function generateJobId(): string {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ── Resolución de URL base ────────────────────────────────────────────────────

function getBaseUrl(): string {
  // En Vercel: VERCEL_URL es el dominio del deployment actual (sin protocolo)
  // En dev: NEXT_PUBLIC_BASE_URL apunta a localhost:3000
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
}

// ── Clave interna de worker ───────────────────────────────────────────────────

/**
 * WORKER_SECRET autentica las llamadas internas al endpoint /api/workers/[job].
 * Sin esto, cualquiera podría encolar jobs arbitrarios.
 * Usar el mismo AUTH_SECRET del proyecto o definir WORKER_SECRET explícitamente.
 */
function getWorkerSecret(): string {
  return process.env.WORKER_SECRET ?? process.env.AUTH_SECRET ?? "bsm-worker-dev-secret";
}

// ── Dispatch (fetch interno fire-and-forget) ──────────────────────────────────

/**
 * Envía el envelope al endpoint worker correspondiente.
 * No espera la respuesta — el worker procesa en background.
 *
 * En Vercel, el fetch interno a una Function del mismo deployment
 * garantiza que el proceso no se congela antes de terminar.
 */
function dispatch(envelope: JobEnvelope): void {
  const url = `${getBaseUrl()}/api/workers/${envelope.type}`;

  // Usamos fetch sin await — fire-and-forget real
  fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-worker-secret": getWorkerSecret(),
    },
    body: JSON.stringify(envelope),
  }).catch((err: unknown) => {
    // Solo loggear — no relanzar para no romper el caller
    logger.error("[queue] Dispatch failed — job lost", {
      jobId: envelope.jobId,
      jobType: envelope.type,
      attempt: envelope.attempt,
      error: err instanceof Error ? err.message : String(err),
    });
  });
}

// ── API pública: enqueue ──────────────────────────────────────────────────────

/**
 * Encola un job background. Retorna el jobId inmediatamente.
 * El procesamiento ocurre en el endpoint /api/workers/[job].
 *
 * @example
 *   const jobId = await queue.enqueue("send-email", {
 *     tenantId: auth.tenantId,
 *     to: "cliente@gmail.com",
 *     subject: "Tu pedido fue confirmado",
 *     html: "<p>...</p>",
 *   });
 */
async function enqueue<T extends Record<string, unknown>>(
  type: JobType,
  payload: T,
  options?: { maxAttempts?: number },
): Promise<string> {
  const jobId = generateJobId();
  const envelope: JobEnvelope = {
    jobId,
    type,
    payload,
    attempt: 1,
    maxAttempts: options?.maxAttempts ?? 3,
    enqueuedAt: new Date().toISOString(),
  };

  logger.info("[queue] Job enqueued", {
    jobId,
    jobType: type,
    tenantId: (payload as Record<string, unknown>).tenantId,
  });

  dispatch(envelope);
  return jobId;
}

// ── API pública: retry (llamada interna desde el worker) ───────────────────────

/**
 * Re-encola un job fallido con attempt incrementado y backoff exponencial.
 * Solo llamar desde dentro de un worker handler — no desde código de negocio.
 *
 * Backoff: intento 1→2: 1s, 2→3: 2s, 3→4: 4s, 4→5: 8s
 */
async function retry(envelope: JobEnvelope): Promise<void> {
  const nextAttempt = envelope.attempt + 1;
  if (nextAttempt > envelope.maxAttempts) {
    logger.error("[queue] Job exhausted all retries — dead letter", {
      jobId: envelope.jobId,
      jobType: envelope.type,
      attempts: envelope.attempt,
      maxAttempts: envelope.maxAttempts,
    });
    return;
  }

  const delayMs = Math.pow(2, envelope.attempt - 1) * 1000; // 1s, 2s, 4s, 8s

  logger.warn("[queue] Scheduling retry", {
    jobId: envelope.jobId,
    jobType: envelope.type,
    nextAttempt,
    delayMs,
  });

  // El delay en Vercel: usamos setTimeout solo para diferir el dispatch.
  // Como el dispatch es un fetch saliente, el proceso puede cerrarse inmediatamente
  // después; el servidor destino maneja la request de forma independiente.
  await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
  dispatch({ ...envelope, attempt: nextAttempt });
}

// ── Validación de secret (uso en route handlers) ──────────────────────────────

/**
 * Verifica que la request interna viene de un enqueue legítimo.
 * Usar en el inicio de /api/workers/[job]/route.ts.
 */
export function verifyWorkerSecret(req: Request): boolean {
  const secret = req.headers.get("x-worker-secret");
  return secret === getWorkerSecret();
}

// ── Public API ────────────────────────────────────────────────────────────────

export const queue = {
  enqueue,
  retry,
} as const;
