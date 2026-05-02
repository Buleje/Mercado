import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { handleIncomingMessage } from "@/lib/whatsapp/concierge/concierge-router";
import { emitMeteringEvent } from "@/lib/billing/wire-up/metering-bus";

export const dynamic = "force-dynamic";

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const MetaTextMessageSchema = z.object({
  from: z.string().min(1),
  id: z.string(),
  timestamp: z.string(),
  type: z.string(),
  text: z.object({ body: z.string() }).optional(),
  interactive: z
    .object({
      type: z.string(),
      button_reply: z.object({ id: z.string(), title: z.string() }).optional(),
      list_reply: z.object({ id: z.string(), title: z.string() }).optional(),
    })
    .optional(),
});

const MetaWebhookBodySchema = z.object({
  object: z.string().optional(),
  entry: z
    .array(
      z.object({
        id: z.string().optional(),
        changes: z
          .array(
            z.object({
              field: z.string().optional(),
              value: z.object({
                messaging_product: z.string().optional(),
                metadata: z
                  .object({
                    display_phone_number: z.string().optional(),
                    phone_number_id: z.string(),
                  })
                  .optional(),
                messages: z.array(MetaTextMessageSchema).optional(),
                statuses: z
                  .array(
                    z.object({ recipient_id: z.string(), status: z.string() })
                  )
                  .optional(),
              }),
            })
          )
          .optional(),
      })
    )
    .optional(),
});

type MetaWebhookBody = z.infer<typeof MetaWebhookBodySchema>;

// ─── Signature verification ───────────────────────────────────────────────────

/**
 * Verify Meta's X-Hub-Signature-256 header. Uses crypto.timingSafeEqual to
 * prevent timing-attack inference of the signature byte-by-byte.
 */
async function verifyHubSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): Promise<boolean> {
  if (!signatureHeader) return false;
  const { createHmac, timingSafeEqual } = await import("crypto");
  const expected =
    "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
  const sigBuf = Buffer.from(signatureHeader);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return false;
  return timingSafeEqual(sigBuf, expBuf);
}

// ─── Tenant resolution ────────────────────────────────────────────────────────

async function resolveTenant(phoneNumberId: string) {
  return (prisma as unknown as {
    tenantWhatsAppConfig: {
      findFirst: (args: unknown) => Promise<{
        tenantId: string;
        phoneNumberId: string;
        whatsappToken: string;
        businessName: string | null;
        yapeNumber: string | null;
      } | null>;
    };
  }).tenantWhatsAppConfig.findFirst({
    where: { phoneNumberId, isActive: true },
  });
}

// ─── Reply sender ─────────────────────────────────────────────────────────────

async function sendWhatsAppReply(
  phoneNumberId: string,
  token: string,
  to: string,
  body: string,
  tenantId?: string,
): Promise<void> {
  const res = await fetch(
    `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: to.replace(/\D/g, ""),
        type: "text",
        text: { body },
      }),
    },
  );

  if (!res.ok) {
    logger.warn("[whatsapp/concierge] sendReply failed", {
      status: res.status,
      phoneNumberId,
    });
    return;
  }

  // ADR-047 billing wire-up: meter successful outbound WhatsApp message
  if (tenantId) {
    try {
      const msgId = `wa:${tenantId}:${to.replace(/\D/g, "")}:${Date.now()}`;
      emitMeteringEvent({
        source: "whatsapp.message.sent",
        tenantId,
        amount: 1,
        idempotencyKey: msgId,
        metadata: { phoneNumberId, chars: body.length },
      });
    } catch {
      // Metering nunca bloquea la conversacion
    }
  }
}

// ─── GET — Meta webhook verification ─────────────────────────────────────────

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode !== "subscribe" || !token || !challenge) {
    return NextResponse.json({ error: "Bad Request" }, { status: 400 });
  }

  const globalToken = process.env.WHATSAPP_VERIFY_TOKEN;
  if (globalToken && token === globalToken) {
    logger.info("[whatsapp/concierge] GET verification OK (global token)");
    return new NextResponse(challenge, { status: 200 });
  }

  const config = await (prisma as unknown as {
    tenantWhatsAppConfig: {
      findFirst: (args: unknown) => Promise<{ tenantId: string } | null>;
    };
  }).tenantWhatsAppConfig.findFirst({
    where: { webhookVerifyToken: token, isActive: true },
  });

  if (config) {
    logger.info("[whatsapp/concierge] GET verification OK", {
      tenantId: config.tenantId,
    });
    return new NextResponse(challenge, { status: 200 });
  }

  logger.warn("[whatsapp/concierge] GET verification failed — bad token");
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

// ─── POST — Receive incoming messages ────────────────────────────────────────

/**
 * Receives Meta WhatsApp webhook events for the AI Concierge.
 * Design principles (ADR-046):
 *  - Respond HTTP 200 immediately — Meta times out at 5s
 *  - Validate X-Hub-Signature-256 with WHATSAPP_WEBHOOK_SECRET
 *  - safeParse Zod on body (never .parse())
 *  - All real processing is fire-and-forget (CLAUDE.md rule #7)
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  // Signature verification (ADR-046 security requirement).
  // Fail-closed in production: if WHATSAPP_WEBHOOK_SECRET is missing, refuse
  // every POST. Without this guard, a missing env in prod would leave the
  // endpoint wide open — anyone could trigger the bot and bill metering.
  const webhookSecret = process.env.WHATSAPP_WEBHOOK_SECRET;
  if (!webhookSecret) {
    if (process.env.NODE_ENV === "production") {
      logger.error(
        "[whatsapp/concierge] WHATSAPP_WEBHOOK_SECRET missing in production — refusing",
      );
      return NextResponse.json(
        { error: "Service misconfigured" },
        { status: 503 },
      );
    }
    logger.warn(
      "[whatsapp/concierge] WHATSAPP_WEBHOOK_SECRET not set — accepting unsigned (dev only)",
    );
  } else {
    const signature = req.headers.get("x-hub-signature-256");
    const valid = await verifyHubSignature(rawBody, signature, webhookSecret);
    if (!valid) {
      logger.warn("[whatsapp/concierge] Invalid signature — rejected");
      return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
    }
  }

  // Respond 200 immediately — Meta requires < 5s response
  // Fire-and-forget the actual processing (CLAUDE.md rule #7)
  processPayload(rawBody).catch((err) => {
    logger.error("[whatsapp/concierge] async processing error", {
      error: err instanceof Error ? err.message : String(err),
    });
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}

// ─── Async processing ─────────────────────────────────────────────────────────

async function processPayload(rawBody: string): Promise<void> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    logger.warn("[whatsapp/concierge] Invalid JSON in payload");
    return;
  }

  // safeParse — never .parse() (CLAUDE.md rule #2)
  const result = MetaWebhookBodySchema.safeParse(parsed);
  if (!result.success) {
    logger.warn("[whatsapp/concierge] Payload schema mismatch", {
      issues: result.error.issues.slice(0, 3),
    });
    return;
  }

  const body: MetaWebhookBody = result.data;

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const phoneNumberId = value.metadata?.phone_number_id;
      if (!phoneNumberId) continue;

      // Status updates — log only, no response needed
      for (const status of value.statuses ?? []) {
        logger.info("[whatsapp/concierge] status update", {
          recipient: status.recipient_id,
          status: status.status,
        });
      }

      // Resolve tenant from phone_number_id
      const tenantConfig = await resolveTenant(phoneNumberId);
      const effectiveTenantId = tenantConfig?.tenantId ?? "main";
      const effectiveToken =
        tenantConfig?.whatsappToken ??
        process.env.WHATSAPP_ACCESS_TOKEN ??
        "";

      if (!effectiveToken) {
        logger.warn("[whatsapp/concierge] No WhatsApp token configured", {
          tenantId: effectiveTenantId,
        });
        continue;
      }

      // Process each incoming message
      for (const message of value.messages ?? []) {
        const text =
          message.text?.body ??
          message.interactive?.button_reply?.title ??
          message.interactive?.list_reply?.title ??
          "";

        const trimmed = text.trim();
        if (!trimmed) continue;

        const phone = message.from.replace(/\D/g, "");

        logger.info("[whatsapp/concierge] processing message", {
          tenantId: effectiveTenantId,
          // PII redaction (audit 2026-05-02 #11): only last 6 digits — Ley 29733 PE.
          phone: phone.slice(-6),
          text: trimmed.slice(0, 80),
        });

        try {
          // Main concierge engine call
          const response = await handleIncomingMessage(
            effectiveTenantId,
            phone,
            trimmed,
          );

          // Fire-and-forget: don't block webhook on WhatsApp API latency
          sendWhatsAppReply(
            phoneNumberId,
            effectiveToken,
            phone,
            response.reply,
            effectiveTenantId,
          ).then(() => {
            logger.info("[whatsapp/concierge] reply sent", {
              tenantId: effectiveTenantId,
              phone,
              state: response.state,
              escalated: response.escalated,
            });
          }).catch((replyErr) => {
            logger.warn("[whatsapp/concierge] reply failed", {
              tenantId: effectiveTenantId,
              phone,
              error: replyErr instanceof Error ? replyErr.message : String(replyErr),
            });
          });
        } catch (err) {
          logger.error("[whatsapp/concierge] engine error", {
            tenantId: effectiveTenantId,
            phone,
            error: err instanceof Error ? err.message : String(err),
          });

          // Best-effort error reply to customer (no metering — system-generated)
          sendWhatsAppReply(
            phoneNumberId,
            effectiveToken,
            phone,
            "Lo siento, ocurrió un error. Escribe *hola* para volver al menú.",
            effectiveTenantId,
          ).catch((replyErr) => logger.error("[whatsapp/concierge] error reply send failed", { error: String(replyErr), phone }));
        }
      }
    }
  }
}
