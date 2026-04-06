/**
 * Worker: send-whatsapp
 *
 * Envía mensajes WhatsApp via API (WHATSAPP_API_URL + WHATSAPP_API_TOKEN).
 * Si la API no está configurada, loggea y sale sin reintentar.
 * Si la API falla (error de red o 5xx), reintenta con backoff.
 * Errores 4xx (número inválido, etc.) no se reintentan.
 */

import { logger } from "@/lib/logger";
import { queue, WhatsappPayloadSchema, type JobEnvelope } from "@/lib/queue";

export async function handleSendWhatsapp(envelope: JobEnvelope): Promise<void> {
  const parsed = WhatsappPayloadSchema.safeParse(envelope.payload);
  if (!parsed.success) {
    logger.error("[worker:send-whatsapp] Invalid payload — skipping retry", {
      jobId: envelope.jobId,
      issues: parsed.error.issues,
    });
    return;
  }

  const { tenantId, phone, message } = parsed.data;

  const apiUrl = process.env.WHATSAPP_API_URL;
  const apiToken = process.env.WHATSAPP_API_TOKEN;

  if (!apiUrl || !apiToken) {
    logger.warn("[worker:send-whatsapp] WhatsApp API not configured — skipping", {
      jobId: envelope.jobId,
      tenantId,
    });
    return;
  }

  // Formatear teléfono (9 dígitos → agregar prefijo 51 de Perú)
  const digits = phone.replace(/\D/g, "");
  const formatted = digits.length === 9 ? `51${digits}` : digits;

  try {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiToken}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: formatted,
        type: "text",
        text: { body: message },
      }),
    });

    if (!res.ok) {
      const text = await res.text();

      // 4xx → error del cliente (número inválido, cuenta bloqueada, etc.) — no reintentar
      if (res.status >= 400 && res.status < 500) {
        logger.error("[worker:send-whatsapp] Client error — not retrying", {
          jobId: envelope.jobId,
          tenantId,
          phone: formatted,
          status: res.status,
          body: text,
        });
        return;
      }

      // 5xx → error del servidor — reintentar
      throw new Error(`WhatsApp API ${res.status}: ${text}`);
    }

    logger.info("[worker:send-whatsapp] Message sent", {
      jobId: envelope.jobId,
      tenantId,
      phone: formatted,
      attempt: envelope.attempt,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    logger.error("[worker:send-whatsapp] Failed to send message", {
      jobId: envelope.jobId,
      tenantId,
      phone: formatted,
      attempt: envelope.attempt,
      error: errorMessage,
    });

    await queue.retry(envelope);
  }
}
