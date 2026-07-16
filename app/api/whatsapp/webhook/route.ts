import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { redactPhone, truncate } from "@/lib/logger-pii";
import { processMessage } from "@/lib/whatsapp/conversation-engine";
import { handleIncomingMessage as handleConciergeMessage } from "@/lib/whatsapp/concierge/concierge-router";
import { WhatsAppMessagesDB } from "@/lib/db/whatsapp-messages.db";

// ─── Feature flag (ADR-058) ───────────────────────────────────────────────────
//
// AI-first routing: el webhook delega al Concierge AI (ADR-046) primero,
// y cae al motor keyword legacy (conversation-engine.ts) solo si:
//   - el flag está apagado
//   - el Concierge lanza una excepción no capturada
//
// Default: ON. Se puede apagar con WHATSAPP_AI_FIRST=false (kill switch).
function isAiFirstEnabled(): boolean {
  const v = process.env.WHATSAPP_AI_FIRST;
  if (v === undefined || v === null || v === "") return true;
  return v.toLowerCase() !== "false" && v !== "0";
}

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
    // Meta adjunta el nombre de perfil del remitente (para el inbox del admin)
    contacts?: { wa_id: string; profile?: { name?: string } }[];
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
  if (!signatureHeader) return false;
  const crypto = await import("crypto");
  const expected =
    "sha256=" +
    crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  // SECURITY 2026-05-06 (audit WhatsApp #2): comparación timing-safe.
  // Antes `===` permitía byte-by-byte timing attack para forjar la firma.
  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
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
): Promise<boolean> {
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
  return res.ok;
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
  // PENTEST 2026-05-18 Sprint B: rate limit STRICT. Meta nunca envía más
  // de 1 webhook/sec por número. Sin rate limit, atacante con firmas
  // inválidas puede agotar CPU en HMAC verify por cada request.
  const rl = applyRateLimit(req, "STRICT", "whatsapp-webhook");
  if (rl) return rl as NextResponse;

  // Leer el body crudo antes de cualquier operación (firma requiere raw bytes)
  const rawBody = await req.text();

  // SECURITY 2026-05-06 (audit WhatsApp #1): fail-closed en producción si
  // falta APP_SECRET. Antes el endpoint aceptaba CUALQUIER POST sin firma
  // si la env var no estaba seteada → vector trivial de forge de webhooks.
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  const isProd = process.env.NODE_ENV === "production";
  if (!appSecret) {
    if (isProd) {
      logger.error("[whatsapp/webhook] WHATSAPP_APP_SECRET ausente en prod — rechazando");
      return NextResponse.json({ error: "service unavailable" }, { status: 503 });
    }
    logger.warn("[whatsapp/webhook] WHATSAPP_APP_SECRET ausente — solo permitido en dev");
  } else {
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
// Exportado para tests directos (ADR-058) — el POST handler lo dispara
// fire-and-forget, los tests pueden awaitearlo determinísticamente.

export async function processWebhookPayload(rawBody: string): Promise<void> {
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

      // Nombre de perfil del remitente (Meta lo manda en value.contacts)
      const contactNames = new Map<string, string>();
      for (const c of value.contacts ?? []) {
        if (c.profile?.name) contactNames.set(normalizePhone(c.wa_id), c.profile.name);
      }

      for (const message of value.messages ?? []) {
        await handleSingleMessage(message, phoneNumberId, tenantConfig, contactNames);
      }
    }
  }
}

async function handleSingleMessage(
  message: MetaTextMessage,
  phoneNumberId: string,
  tenantConfig: {
    tenantId: string;
    phoneNumberId: string;
    whatsappToken: string;
    businessName: string | null;
    yapeNumber: string | null;
  } | null,
  contactNames: Map<string, string> = new Map()
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
      from: redactPhone(senderPhone),
    });
    return;
  }

  // SECURITY 2026-05-06 (audit WhatsApp #5): si no hay tenantConfig para el
  // phone_number_id receptor, descartar el mensaje (no asumir "main").
  // Antes ordenes/facturas/respuestas AI se generaban en el tenant `main`
  // sin querer cuando un tenant no tenía config.
  if (!tenantConfig) {
    logger.warn("[whatsapp/webhook] Sin tenantConfig — mensaje descartado", {
      from: redactPhone(senderPhone),
    });
    return;
  }

  const effectiveToken =
    tenantConfig.whatsappToken ??
    process.env.WHATSAPP_ACCESS_TOKEN ??
    process.env.WHATSAPP_API_TOKEN ??
    "";

  const effectiveTenantId = tenantConfig.tenantId;
  const businessName = tenantConfig.businessName ?? "Bodega";
  const yapeNumber = tenantConfig.yapeNumber ?? null;

  if (!effectiveToken) {
    logger.warn("[whatsapp/webhook] Sin token de WhatsApp configurado", {
      tenantId: effectiveTenantId,
    });
    return;
  }

  // PENTEST Sprint D #6: redact phone + truncate text antes de loggear.
  logger.info("[whatsapp/webhook] Procesando mensaje", {
    from: redactPhone(senderPhone),
    tenantId: effectiveTenantId,
    textPreview: truncate(text, 60),
    aiFirst: isAiFirstEnabled(),
  });

  // Inbox admin (migración 310): persistir el mensaje entrante. Fire-and-forget
  // — el log jamás bloquea la respuesta al cliente. Dedupe por waMessageId.
  WhatsAppMessagesDB.append(effectiveTenantId, {
    phoneNumberId,
    customerPhone: senderPhone,
    customerName: contactNames.get(senderPhone),
    direction: "in",
    sentBy: "customer",
    body: text,
    waMessageId: message.id,
  }).catch((err) => {
    logger.error("[whatsapp/webhook] persistencia inbound falló", {
      error: err instanceof Error ? err.message : String(err),
      tenantId: effectiveTenantId,
    });
  });

  // ── ADR-058: AI-first routing con fallback al engine legacy ───────────────
  // El Concierge AI (ADR-046) jamás lanza — captura todo internamente y
  // devuelve un mensaje amigable. Si por alguna razón bizarra lanza, caemos
  // al motor keyword. Ambos engines son safe individualmente.
  const aiFirst = isAiFirstEnabled();

  let replyText: string | null = null;
  let pathUsed: "ai-concierge" | "legacy-keyword" = "legacy-keyword";

  if (aiFirst) {
    try {
      const conciergeResult = await handleConciergeMessage(
        effectiveTenantId,
        senderPhone,
        text
      );
      replyText = conciergeResult.reply;
      pathUsed = "ai-concierge";
      logger.info("[whatsapp/webhook] Concierge AI manejó el mensaje", {
        to: senderPhone,
        state: conciergeResult.state,
        escalated: conciergeResult.escalated,
      });
    } catch (err) {
      logger.warn(
        "[whatsapp/webhook] Concierge AI lanzó excepción inesperada — fallback a legacy",
        {
          error: err instanceof Error ? err.message : String(err),
          from: senderPhone,
        }
      );
    }
  }

  if (!replyText) {
    // Camino legacy: WHATSAPP_AI_FIRST=false o el Concierge crasheó (no debería)
    try {
      const result = await processMessage(
        effectiveTenantId,
        senderPhone,
        text,
        { businessName, yapeNumber }
      );
      replyText = result.reply;
      logger.info("[whatsapp/webhook] Respuesta legacy enviada", {
        to: senderPhone,
        newState: result.newState,
      });
    } catch (err) {
      logger.error(
        "[whatsapp/webhook] Error procesando mensaje (legacy también falló)",
        { error: err, from: senderPhone }
      );
      replyText =
        "Ocurrió un error. Por favor escribe *hola* para volver al menú.";
    }
  }

  const sentOk = await sendReply(
    phoneNumberId,
    effectiveToken,
    senderPhone,
    replyText
  ).catch((replyErr) => {
    logger.warn("[whatsapp/webhook] sendReply falló", {
      error: replyErr instanceof Error ? replyErr.message : String(replyErr),
      to: senderPhone,
      path: pathUsed,
    });
    return false;
  });

  // Inbox admin: persistir la respuesta del bot (fire-and-forget).
  WhatsAppMessagesDB.append(effectiveTenantId, {
    phoneNumberId,
    customerPhone: senderPhone,
    customerName: contactNames.get(senderPhone),
    direction: "out",
    sentBy: "ai",
    body: replyText,
    status: sentOk ? "sent" : "failed",
  }).catch((err) => {
    logger.error("[whatsapp/webhook] persistencia outbound falló", {
      error: err instanceof Error ? err.message : String(err),
      tenantId: effectiveTenantId,
    });
  });
}
