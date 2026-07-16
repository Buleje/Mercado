import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { logger } from "@/lib/logger";
import { redactPhone } from "@/lib/logger-pii";
import { WhatsAppMessagesDB, getWhatsAppConfig } from "@/lib/db/whatsapp-messages.db";

const SendSchema = z.object({
  phone: z.string().regex(/^\d{8,15}$/, "Teléfono inválido"),
  message: z.string().trim().min(1, "Mensaje requerido").max(4096, "Máx 4096 caracteres"),
  customerName: z.string().max(80).optional(),
});

type GraphError = { error?: { code?: number; message?: string } };

/**
 * POST /api/admin/whatsapp/send — el admin responde a un cliente por WhatsApp.
 *
 * Envía vía Meta Cloud API con las credenciales del tenant (TenantWhatsAppConfig)
 * y persiste el mensaje en el log del inbox (sentBy: admin).
 *
 * Regla de Meta: fuera de la ventana de 24h desde el último mensaje del cliente,
 * solo se permiten plantillas aprobadas (error 131047) — devolvemos un mensaje
 * honesto para que el operador sepa por qué no salió.
 */
export async function POST(req: NextRequest) {
  const _rl = applyRateLimit(req, "MODERATE", "admin-whatsapp-send");
  if (_rl) return _rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = SendSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
      { status: 400 },
    );
  }
  const { phone, message, customerName } = parsed.data;

  const config = await getWhatsAppConfig(auth.tenantId);
  if (!config || !config.isActive) {
    return NextResponse.json(
      { error: "WhatsApp no está conectado. Configura tu número en el sub-tab Bot WhatsApp." },
      { status: 409 },
    );
  }

  const token =
    config.whatsappToken ||
    process.env.WHATSAPP_ACCESS_TOKEN ||
    process.env.WHATSAPP_API_TOKEN ||
    "";
  if (!token) {
    return NextResponse.json(
      { error: "Falta el token de WhatsApp. Vuelve a guardar la configuración del bot." },
      { status: 409 },
    );
  }

  // ── Enviar vía Meta Cloud API ────────────────────────────────────────────────
  let res: Response;
  try {
    res = await fetch(`https://graph.facebook.com/v18.0/${config.phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: phone,
        type: "text",
        text: { body: message },
      }),
    });
  } catch (e) {
    logger.error("[admin/whatsapp/send] fetch a Graph API falló", {
      tenantId: auth.tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(
      { error: "No se pudo contactar a WhatsApp. Intenta de nuevo." },
      { status: 502 },
    );
  }

  if (!res.ok) {
    const detail = (await res.json().catch(() => ({}))) as GraphError;
    const code = detail.error?.code;
    logger.warn("[admin/whatsapp/send] Meta rechazó el envío", {
      tenantId: auth.tenantId,
      to: redactPhone(phone),
      status: res.status,
      code,
      metaMessage: detail.error?.message,
    });

    // Persistir el intento fallido para que el hilo cuente la historia real
    WhatsAppMessagesDB.append(auth.tenantId, {
      phoneNumberId: config.phoneNumberId,
      customerPhone: phone,
      customerName,
      direction: "out",
      sentBy: "admin",
      body: message,
      status: "failed",
    }).catch((err) => {
      logger.error("[admin/whatsapp/send] persistencia de fallo falló", {
        tenantId: auth.tenantId,
        error: err instanceof Error ? err.message : String(err),
      });
    });

    const friendly =
      code === 131047
        ? "Pasaron más de 24h desde el último mensaje del cliente. WhatsApp solo permite plantillas aprobadas fuera de esa ventana."
        : code === 190
          ? "El token de WhatsApp expiró. Genera uno nuevo en Meta y guárdalo en Bot WhatsApp."
          : "WhatsApp rechazó el mensaje. Revisa la configuración del número.";
    return NextResponse.json({ error: friendly, code }, { status: 422 });
  }

  const sent = (await res.json().catch(() => ({}))) as {
    messages?: { id?: string }[];
  };
  const waMessageId = sent.messages?.[0]?.id ?? null;

  const persisted = await WhatsAppMessagesDB.append(auth.tenantId, {
    phoneNumberId: config.phoneNumberId,
    customerPhone: phone,
    customerName,
    direction: "out",
    sentBy: "admin",
    body: message,
    waMessageId,
    status: "sent",
  });

  logger.info("[admin/whatsapp/send] mensaje enviado", {
    tenantId: auth.tenantId,
    to: redactPhone(phone),
  });
  return NextResponse.json({ ok: true, message: persisted }, { status: 201 });
}
