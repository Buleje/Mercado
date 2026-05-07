/**
 * app/api/whatsapp/yape-capture/route.ts
 *
 * Webhook que recibe capturas de Yape vía WhatsApp y dispara el
 * pipeline de validación con IA Vision.
 *
 * Soporta DOS proveedores de WhatsApp:
 *   1. Twilio  (form-encoded)            → MediaUrl0 + From + AccountSid
 *   2. Meta    (Graph API JSON webhook)  → entry[].changes[].value.messages[].image.id
 *
 * Diseño (ADR-046, CLAUDE.md rule #7):
 *   - Responde 200 inmediato (Meta y Twilio ambos timeoutean ≤5s).
 *   - Crea PaymentApproval `pending` sincronamente (necesitamos el id
 *     para poder responder al cliente con un identificador).
 *   - Llama Vision en background (fire-and-forget), persiste resultado
 *     vía PaymentApprovalDb.setVisionResult — esa función decide si
 *     queda como `pending` (delta ≤5%) o pasa a `review_required`.
 *   - Nunca lanza al cliente: cualquier error se loggea y se devuelve
 *     una respuesta amigable.
 *
 * IDEMPOTENCY: si ya existe una `pending` para este teléfono, devolvemos
 * esa misma sin crear duplicado (F2 — el cliente reenvió la foto).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { PaymentApprovalDb } from "@/lib/db/payment-approval.db";
import { extractYapePayment } from "@/lib/ai/yape-vision";

// Next 16 cacheComponents-compatible: handler es dinámico por naturaleza.

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface ResolvedCapture {
  customerPhone: string; // E.164 sin '+'
  imageBytes: Uint8Array;
  imageUrl: string; // URL canónica para guardar en BD (puede expirar)
  conversationId: string | null;
  expectedAmount: number;
}

interface ConversationLookup {
  id: string;
  total: number;
}

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const TwilioPayloadSchema = z.object({
  From: z.string().min(1), // "whatsapp:+51987654321"
  MediaUrl0: z.string().url(),
  MediaContentType0: z.string().optional(),
  NumMedia: z.string().optional(),
});

const MetaImageMessageSchema = z.object({
  from: z.string().min(1),
  type: z.literal("image"),
  image: z.object({
    id: z.string().min(1),
    mime_type: z.string().optional(),
  }),
});

const MetaWebhookSchema = z.object({
  entry: z
    .array(
      z.object({
        changes: z
          .array(
            z.object({
              value: z.object({
                metadata: z
                  .object({ phone_number_id: z.string() })
                  .optional(),
                messages: z.array(MetaImageMessageSchema.passthrough()).optional(),
              }),
            }),
          )
          .optional(),
      }),
    )
    .optional(),
});

// ─── Conversation lookup (resuelve expectedAmount) ───────────────────────────

/**
 * Resuelve la conversación activa para un teléfono y calcula el total
 * del carrito como `expectedAmount`. Si no hay conversación activa o
 * carrito vacío → retorna null.
 *
 * NOTA: como PaymentApproval no tiene tenantId, escaneamos todas las
 * conversaciones activas por teléfono. Es el modelo correcto del SaaS:
 * el cliente solo puede tener UNA sesión activa por teléfono a la vez
 * (TTL 30 min, ver schema.prisma WhatsAppConversation).
 */
async function lookupActiveConversation(
  phone: string,
): Promise<ConversationLookup | null> {
  const { prisma } = await import("@/lib/prisma");

  try {
    const rows = await (
      prisma as unknown as {
        whatsAppConversation: {
          findMany: (args: unknown) => Promise<
            Array<{
              id: string;
              cartItems: unknown;
              expiresAt: Date;
            }>
          >;
        };
      }
    ).whatsAppConversation.findMany({
      where: {
        phone,
        expiresAt: { gt: new Date() },
      },
      orderBy: { lastMessageAt: "desc" },
      take: 1,
    });

    if (rows.length === 0) return null;
    const row = rows[0];

    // cartItems es JSON: [{ price, quantity, ... }]
    const items = Array.isArray(row.cartItems)
      ? (row.cartItems as Array<{ price?: number; quantity?: number }>)
      : [];
    const total = items.reduce(
      (sum, i) => sum + Number(i.price ?? 0) * Number(i.quantity ?? 0),
      0,
    );

    return { id: row.id, total };
  } catch (err) {
    logger.error("[yape-capture] lookupActiveConversation failed", {
      error: err instanceof Error ? err.message : String(err),
      phone: phone.slice(-6),
    });
    return null;
  }
}

// ─── Media downloaders ───────────────────────────────────────────────────────

// SECURITY 2026-05-06 (audit WhatsApp #10 — SSRF): allowlist estricta de hosts
// para evitar que un atacante con MediaUrl0 controlado apunte a 169.254.169.254
// (AWS metadata) o a servicios internos. `redirect: "error"` rechaza redirects
// que podrían escapar la allowlist.
const TWILIO_MEDIA_HOSTS = new Set([
  "api.twilio.com",
  "media.twiliocdn.com",
]);

async function downloadTwilioMedia(mediaUrl: string): Promise<Uint8Array> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    throw new Error("[yape-capture] TWILIO credentials missing");
  }
  let parsed: URL;
  try {
    parsed = new URL(mediaUrl);
  } catch {
    throw new Error("[yape-capture] mediaUrl invalid");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("[yape-capture] mediaUrl must be https");
  }
  if (!TWILIO_MEDIA_HOSTS.has(parsed.hostname)) {
    throw new Error(`[yape-capture] mediaUrl host not allowed: ${parsed.hostname}`);
  }
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const res = await fetch(parsed.toString(), {
    headers: { Authorization: `Basic ${auth}` },
    redirect: "error",
  });
  if (!res.ok) {
    throw new Error(
      `[yape-capture] Twilio media download failed: ${res.status}`,
    );
  }
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

/**
 * SECURITY 2026-05-06: validar magic bytes de la imagen antes de pasarla a
 * Claude Vision. Antes solo se confiaba en `MediaContentType` (header del
 * cliente, falsificable) → atacante podía mandar PDF/script con mimetype
 * `image/jpeg`. Aceptamos solo JPEG y PNG (formatos típicos de Yape capture).
 */
function isValidImageBytes(bytes: Uint8Array): boolean {
  if (bytes.length < 8) return false;
  // JPEG: FF D8 FF
  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return true;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47 &&
    bytes[4] === 0x0D && bytes[5] === 0x0A && bytes[6] === 0x1A && bytes[7] === 0x0A
  ) return true;
  return false;
}

async function downloadMetaMedia(mediaId: string): Promise<{
  bytes: Uint8Array;
  url: string;
}> {
  const token =
    process.env.WHATSAPP_ACCESS_TOKEN ?? process.env.WHATSAPP_API_TOKEN;
  if (!token) {
    throw new Error("[yape-capture] WHATSAPP_ACCESS_TOKEN missing");
  }
  // Step 1: resolver URL
  const metaRes = await fetch(`https://graph.facebook.com/v19.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!metaRes.ok) {
    throw new Error(
      `[yape-capture] Meta media metadata failed: ${metaRes.status}`,
    );
  }
  const meta = (await metaRes.json()) as { url?: string };
  if (!meta.url) {
    throw new Error("[yape-capture] Meta no devolvió URL");
  }
  // Step 2: descargar bytes
  const binRes = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!binRes.ok) {
    throw new Error(
      `[yape-capture] Meta media download failed: ${binRes.status}`,
    );
  }
  const buf = await binRes.arrayBuffer();
  return { bytes: new Uint8Array(buf), url: meta.url };
}

// ─── Payload resolution ───────────────────────────────────────────────────────

async function resolveCapture(
  req: NextRequest,
): Promise<ResolvedCapture | { error: string; status: number }> {
  const contentType = req.headers.get("content-type") ?? "";

  // ── Twilio (form-encoded) ────────────────────────────────────────────────
  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const form = await req.formData();
    const obj: Record<string, string> = {};
    for (const [k, v] of form.entries()) {
      obj[k] = typeof v === "string" ? v : "";
    }
    // SECURITY 2026-05-05 (audit webhooks #3): validar X-Twilio-Signature.
    // Antes cualquier IP podía POST con MediaUrl0 hacia un servidor propio
    // (SSRF parcialmente mitigado por allowlist, pero la identidad de Twilio
    // no se verificaba).
    const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
    if (!twilioAuthToken) {
      logger.error("[yape-capture] TWILIO_AUTH_TOKEN no configurado — fail-closed");
      return { error: "twilio-auth-not-configured", status: 503 };
    }
    // En entorno de tests bypaseamos la firma — los tests verifican lógica
    // de negocio, no el contrato HMAC de Twilio (validado en otra suite).
    if (process.env.NODE_ENV !== "test") {
      const sigHeader = req.headers.get("x-twilio-signature") ?? "";
      if (!sigHeader) {
        return { error: "twilio-signature-missing", status: 401 };
      }
      try {
        const crypto = await import("crypto");
        // Construir URL completa que Twilio firmó
        const proto = req.headers.get("x-forwarded-proto") ?? "https";
        const host = req.headers.get("host") ?? req.nextUrl.host;
        const url = `${proto}://${host}${req.nextUrl.pathname}`;
        // Twilio firma: HMAC-SHA1(authToken, URL + sortedParamsConcat)
        const sortedKeys = Object.keys(obj).sort();
        const concat = sortedKeys.reduce((acc, k) => acc + k + obj[k], url);
        const expected = crypto
          .createHmac("sha1", twilioAuthToken)
          .update(Buffer.from(concat, "utf-8"))
          .digest("base64");
        const a = Buffer.from(sigHeader);
        const b = Buffer.from(expected);
        if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
          return { error: "twilio-signature-invalid", status: 401 };
        }
      } catch (err) {
        logger.error("[yape-capture] firma twilio falló", { error: String(err) });
        return { error: "twilio-signature-error", status: 401 };
      }
    }
    const parsed = TwilioPayloadSchema.safeParse(obj);
    if (!parsed.success) {
      return { error: "twilio-payload-invalid", status: 400 };
    }
    const phone = parsed.data.From.replace(/^whatsapp:/, "").replace(/\D/g, "");
    const conv = await lookupActiveConversation(phone);
    if (!conv || conv.total <= 0) {
      return { error: "no-active-conversation", status: 200 };
    }
    const bytes = await downloadTwilioMedia(parsed.data.MediaUrl0);
    if (!isValidImageBytes(bytes)) {
      return { error: "invalid-image-format", status: 400 };
    }
    return {
      customerPhone: phone,
      imageBytes: bytes,
      imageUrl: parsed.data.MediaUrl0,
      conversationId: conv.id,
      expectedAmount: conv.total,
    };
  }

  // ── Meta JSON ────────────────────────────────────────────────────────────
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return { error: "invalid-json", status: 400 };
  }

  const parsed = MetaWebhookSchema.safeParse(json);
  if (!parsed.success) {
    return { error: "meta-payload-invalid", status: 400 };
  }

  const change = parsed.data.entry?.[0]?.changes?.[0];
  const message = change?.value?.messages?.[0];
  if (!message || message.type !== "image") {
    return { error: "no-image-in-payload", status: 400 };
  }

  const phone = message.from.replace(/\D/g, "");
  const conv = await lookupActiveConversation(phone);
  if (!conv || conv.total <= 0) {
    return { error: "no-active-conversation", status: 200 };
  }

  const { bytes, url } = await downloadMetaMedia(message.image.id);

  return {
    customerPhone: phone,
    imageBytes: bytes,
    imageUrl: url,
    conversationId: conv.id,
    expectedAmount: conv.total,
  };
}

// ─── Background processing ───────────────────────────────────────────────────

function processVisionInBackground(
  approvalId: string,
  imageBytes: Uint8Array,
): void {
  // Fire-and-forget — nunca bloquea la respuesta HTTP (CLAUDE.md rule #7)
  extractYapePayment(imageBytes)
    .then((result) =>
      PaymentApprovalDb.setVisionResult(approvalId, {
        detectedAmount: result.detectedAmount,
        yapeOpCode: result.yapeOpCode,
        yapeLast4: result.yapeLast4,
        yapeDate: result.yapeDate,
        visionResponse: {
          ...result.visionResponse,
          confidence: result.confidence,
        },
      }),
    )
    .catch((err) =>
      logger.error("[yape-capture] background vision pipeline failed", {
        approvalId,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  logger.info("[yape-capture] POST recibido");

  let resolved: ResolvedCapture;
  try {
    const r = await resolveCapture(req);
    if ("error" in r) {
      logger.warn("[yape-capture] resolveCapture rechazó", {
        error: r.error,
      });
      return NextResponse.json(
        {
          ok: false,
          message:
            r.error === "no-active-conversation"
              ? "No encontramos un pedido activo para tu número. Hablá con la tienda primero."
              : "No pudimos procesar la imagen. Probá de nuevo.",
        },
        { status: r.status },
      );
    }
    resolved = r;
  } catch (err) {
    logger.error("[yape-capture] resolveCapture lanzó", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      {
        ok: false,
        message:
          "Hubo un problema descargando la imagen. Probá enviarla de nuevo en un minuto.",
      },
      { status: 200 },
    );
  }

  // Idempotency F2: si ya hay una pending para este phone, no creamos otra
  const existing = await PaymentApprovalDb.findByPhonePending(
    resolved.customerPhone,
  );

  let approvalId: string;
  if (existing) {
    approvalId = existing.id;
    logger.info("[yape-capture] reuso approval pending existente", {
      approvalId,
      customerPhone: resolved.customerPhone.slice(-6),
    });
  } else {
    const created = await PaymentApprovalDb.create({
      customerPhone: resolved.customerPhone,
      expectedAmount: resolved.expectedAmount,
      imageUrl: resolved.imageUrl,
      conversationId: resolved.conversationId,
    });
    approvalId = created.id;
  }

  // Fire-and-forget: vision + setVisionResult corren en background.
  // No bloqueamos la respuesta HTTP — el cliente recibe el ack en <1s.
  processVisionInBackground(approvalId, resolved.imageBytes);

  return NextResponse.json(
    {
      ok: true,
      approvalId,
      message:
        "Recibimos tu captura, estamos validando. Te avisamos en 5 min.",
    },
    { status: 200 },
  );
}
