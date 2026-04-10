/**
 * Worker: send-email
 *
 * Procesa jobs de tipo "send-email" encolados por queue.enqueue().
 * Usa Nodemailer con SMTP de Gmail (SMTP_USER + SMTP_PASS).
 * Si falla, delega el retry a queue.retry() con backoff exponencial.
 */

import { logger } from "@/lib/logger";
import { queue, EmailPayloadSchema, type JobEnvelope } from "@/lib/queue";
import nodemailer from "nodemailer";

export async function handleSendEmail(envelope: JobEnvelope): Promise<void> {
  // Validar payload específico del job
  const parsed = EmailPayloadSchema.safeParse(envelope.payload);
  if (!parsed.success) {
    // Payload inválido → no tiene sentido reintentar
    logger.error("[worker:send-email] Invalid payload — skipping retry", {
      jobId: envelope.jobId,
      issues: parsed.error.issues,
    });
    return;
  }

  const { tenantId, to, subject, html, emailType } = parsed.data;

  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (!smtpUser || !smtpPass) {
    // SMTP no configurado — no es un error de runtime, no reintentar
    logger.warn("[worker:send-email] SMTP not configured — skipping", {
      jobId: envelope.jobId,
      tenantId,
      emailType,
    });
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: { user: smtpUser, pass: smtpPass },
    });

    await transporter.sendMail({
      from: `"Buleje" <${smtpUser}>`,
      to,
      subject,
      html,
    });

    logger.info("[worker:send-email] Email sent", {
      jobId: envelope.jobId,
      tenantId,
      to,
      emailType,
      attempt: envelope.attempt,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    logger.error("[worker:send-email] Failed to send email", {
      jobId: envelope.jobId,
      tenantId,
      to,
      emailType,
      attempt: envelope.attempt,
      error: errorMessage,
    });

    // Delegar retry — queue.retry() loggea si se agotaron los intentos
    await queue.retry(envelope);
  }
}
