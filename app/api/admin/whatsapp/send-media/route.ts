import "server-only";
import { NextRequest, NextResponse } from "next/server";
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

const MAX_BYTES = 10 * 1024 * 1024; // 10MB (límite práctico de WhatsApp para imágenes/docs)
const ALLOWED = /^(image\/(jpeg|png|webp)|application\/pdf|audio\/(mpeg|ogg))$/;

/**
 * POST /api/admin/whatsapp/send-media — adjuntar un archivo del PC y enviarlo.
 * multipart/form-data: file + phone + phoneNumberId? + caption?
 *
 * Flujo: subir a Meta (media API del número) → enviar por media id →
 * persistir con mediaId (el panel lo muestra vía el proxy de media).
 */
export async function POST(req: NextRequest) {
  const _rl = applyRateLimit(req, "GENEROUS", "admin-whatsapp-send-media");
  if (_rl) return _rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "multipart/form-data requerido" }, { status: 400 });
  }

  const file = form.get("file");
  const phone = String(form.get("phone") ?? "");
  const phoneNumberId = String(form.get("phoneNumberId") ?? "");
  const caption = String(form.get("caption") ?? "").slice(0, 1024);

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
  }
  if (!/^\d{8,15}$/.test(phone)) {
    return NextResponse.json({ error: "Teléfono inválido" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Archivo muy grande (máx 10MB)" }, { status: 413 });
  }
  if (!ALLOWED.test(file.type)) {
    return NextResponse.json(
      { error: "Formato no soportado (JPG, PNG, WebP, PDF, MP3 u OGG)" },
      { status: 415 },
    );
  }

  const config = phoneNumberId && /^\d{1,50}$/.test(phoneNumberId)
    ? await getConfigForPhoneNumberId(auth.tenantId, phoneNumberId)
    : await getWhatsAppConfig(auth.tenantId);
  if (!config || !config.isActive) {
    return NextResponse.json({ error: "WhatsApp no está conectado." }, { status: 409 });
  }
  const token =
    config.whatsappToken ||
    process.env.WHATSAPP_ACCESS_TOKEN ||
    process.env.WHATSAPP_API_TOKEN ||
    "";
  if (!token) {
    return NextResponse.json({ error: "Falta el token de WhatsApp." }, { status: 409 });
  }

  try {
    // 1) Subir el binario a Meta
    const uploadForm = new FormData();
    uploadForm.append("file", file, file.name);
    uploadForm.append("type", file.type);
    uploadForm.append("messaging_product", "whatsapp");
    const upRes = await fetch(
      `https://graph.facebook.com/v18.0/${config.phoneNumberId}/media`,
      { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: uploadForm },
    );
    const up = (await upRes.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
    if (!upRes.ok || !up.id) {
      logger.warn("[admin/whatsapp/send-media] upload rechazado", {
        tenantId: auth.tenantId,
        status: upRes.status,
        metaMessage: up.error?.message,
      });
      return NextResponse.json({ error: "Meta rechazó el archivo." }, { status: 422 });
    }

    // 2) Enviar el mensaje con el media id
    const kind = file.type.startsWith("image/")
      ? "image"
      : file.type.startsWith("audio/")
        ? "audio"
        : "document";
    const msgPayload: Record<string, unknown> = {
      messaging_product: "whatsapp",
      to: phone,
      type: kind,
      [kind]: {
        id: up.id,
        ...(kind !== "audio" && caption ? { caption } : {}),
        ...(kind === "document" ? { filename: file.name } : {}),
      },
    };
    const sendRes = await fetch(
      `https://graph.facebook.com/v18.0/${config.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(msgPayload),
      },
    );
    const sent = (await sendRes.json().catch(() => ({}))) as {
      messages?: { id?: string }[];
      error?: { code?: number };
    };
    if (!sendRes.ok) {
      const friendly =
        sent.error?.code === 131047
          ? "Pasaron más de 24h del último mensaje del cliente — solo se permiten plantillas."
          : sent.error?.code === 131030
            ? "Tu número de PRUEBA solo puede escribir a contactos registrados (máx 5)."
            : "WhatsApp rechazó el envío.";
      return NextResponse.json({ error: friendly, code: sent.error?.code }, { status: 422 });
    }

    // 3) Persistir (el panel lo renderiza vía el proxy con este mediaId)
    const placeholder =
      kind === "image" ? "📷 Foto" : kind === "audio" ? "🎙️ Audio" : `📄 ${file.name}`;
    const persisted = await WhatsAppMessagesDB.append(auth.tenantId, {
      phoneNumberId: config.phoneNumberId,
      customerPhone: phone,
      direction: "out",
      sentBy: "admin",
      body: caption ? `${placeholder} — ${caption}` : placeholder,
      waMessageId: sent.messages?.[0]?.id ?? null,
      mediaId: up.id,
      mediaMime: file.type,
      status: "sent",
    });

    logger.info("[admin/whatsapp/send-media] enviado", {
      tenantId: auth.tenantId,
      to: redactPhone(phone),
      kind,
    });
    return NextResponse.json({ ok: true, message: persisted }, { status: 201 });
  } catch (e) {
    logger.error("[admin/whatsapp/send-media] error", {
      tenantId: auth.tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: "No se pudo enviar el archivo." }, { status: 502 });
  }
}
