/**
 * POST /api/webhooks/nubefact
 *
 * Webhook receiver para actualizaciones de estado de Nubefact.
 * Nubefact llama este endpoint cuando SUNAT acepta o rechaza un CDR.
 *
 * Seguridad:
 *   - Firma HMAC-SHA256 en header "x-nubefact-signature: sha256=<hex>"
 *   - Secret en NUBEFACT_WEBHOOK_SECRET (nunca hardcodeado — regla #10)
 *   - Idempotente: mismo nubefact_id + mismo estado → no duplica actualizaciones
 *
 * Responde 200 inmediatamente (Nubefact requiere ACK rápido).
 */

import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  validateWebhookSignature,
  mapWebhookEstadoToStatus,
  type NubefactWebhookPayload,
} from "@/lib/sunat/webhook-validator";
import { sunatEventBus } from "@/lib/sunat/sale-events";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

// ── Validación Zod del body ───────────────────────────────────────────────────

const WebhookBodySchema = z.object({
  nubefact_id: z.string().min(1),
  estado: z.enum(["ACEPTADO", "RECHAZADO", "ANULADO"]),
  codigo_sunat: z.string().optional(),
  descripcion_sunat: z.string().optional(),
  enlace_del_cdr: z.string().url().optional(),
  enlace_del_pdf: z.string().url().optional(),
  enlace_del_xml: z.string().url().optional(),
  serie: z.string().optional(),
  numero: z.number().int().optional(),
  tipo_de_comprobante: z.number().int().optional(),
});

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.NUBEFACT_WEBHOOK_SECRET;

  if (!webhookSecret) {
    logger.error("[webhook/nubefact] NUBEFACT_WEBHOOK_SECRET no configurado");
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  // Leer body como texto para validar HMAC antes de parsear
  const rawBody = await req.text();
  const signatureHeader = req.headers.get("x-nubefact-signature");

  // Validar firma HMAC
  const validation = validateWebhookSignature(rawBody, signatureHeader, webhookSecret);
  if (!validation.valid) {
    logger.warn("[webhook/nubefact] Firma inválida", {
      error: validation.error,
      ip: req.headers.get("x-forwarded-for") ?? "unknown",
    });
    return NextResponse.json(
      { error: "Firma inválida", detail: validation.error },
      { status: 401 }
    );
  }

  // Parsear y validar body con Zod (safeParse — regla #2)
  let bodyJson: unknown;
  try {
    bodyJson = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Body no es JSON válido" }, { status: 400 });
  }

  const parsed = WebhookBodySchema.safeParse(bodyJson);
  if (!parsed.success) {
    logger.warn("[webhook/nubefact] Payload inválido", {
      issues: parsed.error.issues,
    });
    return NextResponse.json(
      { error: "Payload inválido", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const payload = parsed.data as NubefactWebhookPayload;

  // Buscar el SunatInvoice por nubefact_id
  const invoice = await prisma.sunatInvoice.findFirst({
    where: { nubefactId: payload.nubefact_id },
  });

  if (!invoice) {
    // Puede ser un evento de un tenant que no existe o nubefact_id no registrado
    // Responder 200 para que Nubefact no reintente (idempotencia)
    logger.warn("[webhook/nubefact] Invoice no encontrado por nubefact_id", {
      nubefact_id: payload.nubefact_id,
    });
    return NextResponse.json({ received: true, action: "not_found" });
  }

  const tenantId = invoice.tenantId;
  const newStatus = mapWebhookEstadoToStatus(payload.estado);

  // Idempotencia: si el estado ya es el mismo, no re-procesar
  if (invoice.sunatStatus === newStatus) {
    logger.info("[webhook/nubefact] Estado ya actualizado, skip idempotente", {
      invoiceId: invoice.id,
      status: newStatus,
    });
    return NextResponse.json({ received: true, action: "already_processed" });
  }

  // Actualizar SunatInvoice
  await prisma.sunatInvoice.update({
    where: { id: invoice.id },
    data: {
      sunatStatus: newStatus,
      cdrResponse: payload.enlace_del_cdr ?? invoice.cdrResponse,
      pdfUrl: payload.enlace_del_pdf ?? invoice.pdfUrl,
      errorMessage:
        newStatus === "rejected"
          ? (payload.descripcion_sunat ?? "Rechazado por SUNAT vía webhook")
          : null,
      acceptedAt:
        newStatus === "accepted" ? new Date() : invoice.acceptedAt,
    },
  });

  logger.info("[webhook/nubefact] Invoice actualizado", {
    invoiceId: invoice.id,
    tenantId,
    nubefact_id: payload.nubefact_id,
    newStatus,
  });

  // Emitir evento interno fire-and-forget (regla #7)
  sunatEventBus.emitInvoiceUpdated({
    invoiceId: invoice.id,
    tenantId,
    status: newStatus,
    pdfUrl: payload.enlace_del_pdf ?? undefined,
    nubefactId: payload.nubefact_id,
  });

  return NextResponse.json({ received: true, action: "updated", status: newStatus });
}
