import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { processMessage } from "@/lib/whatsapp/conversation-engine";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MetaTextMessage {
  from: string;
  id: string;
  timestamp: string;
  text?: { body: string };
  type: string;
  interactive?: {
    type: string;
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string };
  };
}

interface MetaChange {
  value: {
    messaging_product: string;
    metadata?: { display_phone_number: string; phone_number_id: string };
    messages?: MetaTextMessage[];
    statuses?: { recipient_id: string; status: string }[];
  };
  field: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "");
}

async function verifySignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string
): Promise<boolean> {
  const crypto = await import("crypto");
  const expected =
    "sha256=" +
    crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  return signatureHeader === expected;
}

/**
 * Resuelve el tenant a partir del phone_number_id del receptor.
 * El número receptor identifica qué tenant configuró ese WhatsApp.
 */
async function resolveTenant(phoneNumberId: string) {
  return prisma.tenantWhatsAppConfig.findFirst({
    where: { phoneNumberId, isActive: true },
  });
}

/**
 * Envía un mensaje de texto via WhatsApp Cloud API usando el token del tenant.
 */
async function sendReply(
  phoneNumberId: string,
  token: string,
  toPhone: string,
  message: string
): Promise<void> {
  const url = `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: normalizePhone(toPhone),
      type: "text",
      text: { body: message },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    logger.warn("[whatsapp/webhook] Error al enviar respuesta", {
      status: res.status,
      detail,
      phoneNumberId,
    });
  }
}

// ─── GET — Meta webhook verification ─────────────────────────────────────────

/**
 * Meta envía un GET con hub.mode=subscribe cuando configuras el webhook.
 * Respondemos con hub.challenge si hub.verify_token coincide con el de algún tenant.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode !== "subscribe" || !token || !challenge) {
    return NextResponse.json({ error: "Bad Request" }, { status: 400 });
  }

  // Verificar contra cualquier tenant configurado (o variable global de fallback)
  const globalToken = process.env.WHATSAPP_VERIFY_TOKEN;
  if (globalToken && token === globalToken) {
    logger.info("[whatsapp/webhook] Verificación GET exitosa (global token)");
    return new NextResponse(challenge, { status: 200 });
  }

  const config = await prisma.tenantWhatsAppConfig.findFirst({
    where: { webhookVerifyToken: token, isActive: true },
  });

  if (config) {
    logger.info("[whatsapp/webhook] Verificación GET exitosa", {
      tenantId: config.tenantId,
    });
    return new NextResponse(challenge, { status: 200 });
  }

  logger.warn("[whatsapp/webhook] Token de verificación incorrecto");
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

// ─── POST — Recibir mensajes entrantes ────────────────────────────────────────

/**
 * Meta envía un POST por cada mensaje entrante.
 * Reglas críticas:
 *  - Responder 200 en < 5 segundos (procesamiento asíncrono fire-and-forget).
 *  - Verificar firma X-Hub-Signature-256 si WHATSAPP_APP_SECRET está configurado.
 */
export async function POST(req: NextRequest) {
  // Leer el body crudo antes de cualquier operación (firma requiere raw bytes)
  const rawBody = await req.text();

  // Verificar firma si el secret global está configurado
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (appSecret) {
    const signature = req.headers.get("x-hub-signature-256");
    const valid = await verifySignature(rawBody, signature, appSecret);
    if (!valid) {
      logger.warn("[whatsapp/webhook] Firma inválida — rechazado");
      return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
    }
  }

  // Responder 200 inmediatamente para cumplir el timeout de Meta (< 5s)
  // El procesamiento real se hace en fire-and-forget
  processWebhookPayload(rawBody).catch((err) => {
    logger.error("[whatsapp/webhook] Error en procesamiento asíncrono", {
      error: err,
    });
  });

  return NextResponse.json({ success: true }, { status: 200 });
}

// ─── Procesamiento asíncrono ──────────────────────────────────────────────────

async function processWebhookPayload(rawBody: string): Promise<void> {
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    logger.warn("[whatsapp/webhook] JSON inválido en payload");
    return;
  }

  const entries = (body.entry as { changes?: MetaChange[] }[]) ?? [];

  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      const value = change.value;

      // Status updates (entregado, leído, etc.) — solo log
      for (const status of value.statuses ?? []) {
        logger.info("[whatsapp/webhook] Status update", {
          recipient: status.recipient_id,
          status: status.status,
        });
      }

      // Mensajes entrantes
      const phoneNumberId = value.metadata?.phone_number_id;
      if (!phoneNumberId) continue;

      const tenantConfig = await resolveTenant(phoneNumberId);

      for (const message of value.messages ?? []) {
        await handleIncomingMessage(message, phoneNumberId, tenantConfig);
      }
    }
  }
}

async function handleIncomingMessage(
  message: MetaTextMessage,
  phoneNumberId: string,
  tenantConfig: {
    tenantId: string;
    phoneNumberId: string;
    whatsappToken: string;
    businessName: string | null;
    yapeNumber: string | null;
  } | null
): Promise<void> {
  const senderPhone = normalizePhone(message.from);

  // Extraer texto (mensaje de texto o botón interactivo)
  let text =
    message.text?.body ??
    message.interactive?.button_reply?.title ??
    message.interactive?.list_reply?.title ??
    "";

  text = text.trim();
  if (!text) {
    logger.info("[whatsapp/webhook] Mensaje sin texto — ignorado", {
      from: senderPhone,
    });
    return;
  }

  // Si no hay config de tenant, usar token global de entorno como fallback
  const effectiveToken =
    tenantConfig?.whatsappToken ??
    process.env.WHATSAPP_ACCESS_TOKEN ??
    process.env.WHATSAPP_API_TOKEN ??
    "";

  const effectiveTenantId = tenantConfig?.tenantId ?? "main";
  const businessName = tenantConfig?.businessName ?? "Bodega";
  const yapeNumber = tenantConfig?.yapeNumber ?? null;

  if (!effectiveToken) {
    logger.warn("[whatsapp/webhook] Sin token de WhatsApp configurado", {
      tenantId: effectiveTenantId,
    });
    return;
  }

  logger.info("[whatsapp/webhook] Procesando mensaje", {
    from: senderPhone,
    tenantId: effectiveTenantId,
    text: text.slice(0, 80),
  });

  try {
    const result = await processMessage(
      effectiveTenantId,
      senderPhone,
      text,
      { businessName, yapeNumber }
    );

    await sendReply(
      phoneNumberId,
      effectiveToken,
      senderPhone,
      result.reply
    );

    logger.info("[whatsapp/webhook] Respuesta enviada", {
      to: senderPhone,
      newState: result.newState,
    });
  } catch (err) {
    logger.error("[whatsapp/webhook] Error procesando mensaje de cliente", {
      error: err,
      from: senderPhone,
    });
    // Intentar enviar mensaje de error al cliente
    await sendReply(
      phoneNumberId,
      effectiveToken,
      senderPhone,
      "Ocurrió un error. Por favor escribe *hola* para volver al menú."
    ).catch(() => {});
  }
}
