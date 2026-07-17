import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { logger } from "@/lib/logger";
import { redactPhone } from "@/lib/logger-pii";
import {
  WhatsAppMessagesDB,
  getWhatsAppConfig,
  getConfigForPhoneNumberId,
} from "@/lib/db/whatsapp-messages.db";
import { getApprovedTemplates, renderTemplateBody } from "@/lib/whatsapp/templates";

const SendSchema = z
  .object({
    phone: z.string().regex(/^\d{8,15}$/, "Teléfono inválido"),
    // Texto libre (dentro de la ventana de 24h)…
    message: z.string().trim().min(1).max(4096, "Máx 4096 caracteres").optional(),
    // …o plantilla aprobada (fuera de la ventana, error 131047 en texto libre)
    template: z
      .object({
        name: z.string().min(1).max(120),
        language: z.string().min(2).max(15),
        params: z.array(z.string().max(500)).max(10).default([]),
      })
      .optional(),
    customerName: z.string().max(80).optional(),
    // Multi-número: por cuál número del negocio sale la respuesta (el del hilo).
    phoneNumberId: z.string().regex(/^\d{1,50}$/).optional(),
  })
  .refine((d) => Boolean(d.message) !== Boolean(d.template), {
    message: "Enviá texto o una plantilla (uno de los dos)",
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
  const _rl = applyRateLimit(req, "GENEROUS", "admin-whatsapp-send");
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
  const { phone, message, template, customerName, phoneNumberId } = parsed.data;

  // El hilo dice por qué número habla el cliente; fallback: primer número activo.
  const config = phoneNumberId
    ? await getConfigForPhoneNumberId(auth.tenantId, phoneNumberId)
    : await getWhatsAppConfig(auth.tenantId);
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

  // ── Payload: texto libre o plantilla aprobada ───────────────────────────────
  let logBody = message ?? "";
  let sendPayload: Record<string, unknown>;
  if (template) {
    const approved = await getApprovedTemplates(config, token);
    if (approved === null) {
      return NextResponse.json(
        { error: "Este número no tiene WABA ID configurado. Agrégalo en Bot WhatsApp para usar plantillas." },
        { status: 409 },
      );
    }
    const t = approved.find((x) => x.name === template.name && x.language === template.language);
    if (!t) {
      return NextResponse.json(
        { error: "Esa plantilla no está aprobada en Meta (o ya no existe)." },
        { status: 422 },
      );
    }
    if (t.paramCount !== template.params.length) {
      return NextResponse.json(
        { error: `La plantilla necesita ${t.paramCount} variable(s).` },
        { status: 400 },
      );
    }
    logBody = renderTemplateBody(t.body, template.params);
    sendPayload = {
      messaging_product: "whatsapp",
      to: phone,
      type: "template",
      template: {
        name: t.name,
        language: { code: t.language },
        ...(template.params.length
          ? {
              components: [
                {
                  type: "body",
                  parameters: template.params.map((p) => ({ type: "text", text: p })),
                },
              ],
            }
          : {}),
      },
    };
  } else {
    sendPayload = {
      messaging_product: "whatsapp",
      to: phone,
      type: "text",
      text: { body: message },
    };
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
      body: JSON.stringify(sendPayload),
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
      body: logBody,
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
        : code === 131030
          ? "Tu número de PRUEBA de Meta solo puede escribir a contactos registrados (máx 5). Registra este número en Meta (API Setup → Para) o pasa a un número real."
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
    body: logBody,
    waMessageId,
    status: "sent",
  });

  logger.info("[admin/whatsapp/send] mensaje enviado", {
    tenantId: auth.tenantId,
    to: redactPhone(phone),
  });
  return NextResponse.json({ ok: true, message: persisted }, { status: 201 });
}
