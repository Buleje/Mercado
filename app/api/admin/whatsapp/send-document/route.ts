import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { logger } from "@/lib/logger";
import { redactPhone } from "@/lib/logger-pii";
import { DocumentsDB } from "@/lib/db/documents.db";
import { downloadFromStorage } from "@/lib/documents/storage";
import { resolverMime } from "@/lib/documents/tipos-archivo";
import {
  WhatsAppMessagesDB,
  getWhatsAppConfig,
  getConfigForPhoneNumberId,
} from "@/lib/db/whatsapp-messages.db";

/**
 * POST /api/admin/whatsapp/send-document — mandar por WhatsApp EL ARCHIVO, no un
 * enlace.
 *
 * Hasta acá, "enviar por WhatsApp" abría wa.me con un mensaje y un link: el que
 * recibía tenía que tocar el enlace, esperar el navegador y recién ahí ver el
 * PDF. Un enlace no es un documento — no queda en el chat, no se reenvía, no se
 * abre sin datos y a los 30 días vence.
 *
 * Acá el archivo sale del drive, se sube a Meta y llega como adjunto de verdad
 * (PDF, Excel, Word, imagen), con su nombre, dentro de la conversación. El
 * navegador no lo toca: el binario va del servidor a Meta.
 *
 * Requiere el WhatsApp del negocio conectado (Cloud API). Sin eso no hay forma
 * de adjuntar nada desde la web —wa.me sólo acepta texto— y el modal ofrece las
 * otras dos vías (compartir desde el celular o, último recurso, el enlace).
 */

/** Topes de Meta: imagen 5 MB, documento 100 MB. Se deja margen. */
const MAX_IMAGEN = 5 * 1024 * 1024;
const MAX_DOCUMENTO = 95 * 1024 * 1024;
/** Las que WhatsApp muestra como foto; el resto viaja como documento. */
const IMAGEN_NATIVA = /^image\/(jpeg|png|webp)$/;
/** Cuántos documentos por tanda: más que esto es un envío masivo, no un envío. */
const MAX_POR_TANDA = 10;

const Body = z.object({
  docIds: z.array(z.string().min(1).max(60)).min(1).max(MAX_POR_TANDA),
  phone: z.string().regex(/^\d{8,15}$/, "Teléfono inválido"),
  phoneNumberId: z.string().regex(/^\d{1,50}$/).optional(),
  /** Texto que acompaña al archivo. Vacío = va sólo el archivo. */
  caption: z.string().max(1024).optional(),
});

type Fallido = { id: string; nombre: string; error: string };

export async function POST(req: NextRequest) {
  const rl = applyRateLimit(req, "GENEROUS", "admin-whatsapp-send-document");
  if (rl) return rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const crudo = await req.json().catch(() => null);
  const parsed = Body.safeParse(crudo);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  }
  const { docIds, phone, phoneNumberId, caption } = parsed.data;

  const config = phoneNumberId
    ? await getConfigForPhoneNumberId(auth.tenantId, phoneNumberId)
    : await getWhatsAppConfig(auth.tenantId);
  if (!config || !config.isActive) {
    return NextResponse.json({ error: "WhatsApp no está conectado.", motivo: "sin_conexion" }, { status: 409 });
  }
  const token =
    config.whatsappToken || process.env.WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_API_TOKEN || "";
  if (!token) {
    return NextResponse.json({ error: "Falta el token de WhatsApp.", motivo: "sin_conexion" }, { status: 409 });
  }

  const enviados: { id: string; nombre: string }[] = [];
  const fallidos: Fallido[] = [];

  // En serie a propósito: Meta limita los envíos por número y un lote en
  // paralelo se gana un 429 del lado de ellos, que no se puede reintentar
  // sin arriesgar mandar el mismo archivo dos veces.
  for (const [i, docId] of docIds.entries()) {
    const doc = await DocumentsDB.getById(auth.tenantId, docId, auth.role);
    if (!doc) { fallidos.push({ id: docId, nombre: docId, error: "El documento ya no está" }); continue; }

    const mime = resolverMime(doc.name, doc.mimeType);
    const esImagen = IMAGEN_NATIVA.test(mime);
    const tope = esImagen ? MAX_IMAGEN : MAX_DOCUMENTO;
    if (doc.size > tope) {
      fallidos.push({
        id: docId, nombre: doc.name,
        error: `Pesa ${(doc.size / 1024 / 1024).toFixed(1)} MB y WhatsApp acepta hasta ${Math.round(tope / 1024 / 1024)} MB`,
      });
      continue;
    }

    const bytes = await downloadFromStorage(doc.storagePath);
    if (!bytes) { fallidos.push({ id: docId, nombre: doc.name, error: "No se pudo leer el archivo" }); continue; }

    try {
      // 1) El binario va a Meta y vuelve como un id reutilizable.
      const subida = new FormData();
      subida.append("file", new Blob([new Uint8Array(bytes)], { type: mime }), doc.name);
      subida.append("type", mime);
      subida.append("messaging_product", "whatsapp");
      const upRes = await fetch(`https://graph.facebook.com/v18.0/${config.phoneNumberId}/media`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` }, body: subida,
      });
      const up = (await upRes.json().catch(() => ({}))) as { id?: string; error?: { message?: string; code?: number } };
      if (!upRes.ok || !up.id) {
        logger.warn("[whatsapp/send-document] Meta rechazó el archivo", {
          tenantId: auth.tenantId, status: upRes.status, metaMessage: up.error?.message, metaCode: up.error?.code, mime,
        });
        // Un "no se pudo" a secas manda a revisar el archivo cuando casi
        // siempre el problema es la conexión: el token vencido de Meta es el
        // caso más común y se arregla en otra pantalla.
        const metaMsg = up.error?.message ?? "";
        const razon =
          upRes.status === 401 || up.error?.code === 190
            ? "La conexión con WhatsApp venció: reconectá el número en Configuración › WhatsApp"
            : /type|format|unsupported|mime/i.test(metaMsg)
              ? "WhatsApp no acepta este tipo de archivo"
              : "WhatsApp no pudo recibir el archivo (revisá la conexión del número)";
        fallidos.push({ id: docId, nombre: doc.name, error: razon });
        continue;
      }

      // 2) El mensaje: foto o documento con su nombre. El texto SÓLO si lo
      //    pidieron — el pedido es que llegue el archivo, no un mensaje.
      const kind = esImagen ? "image" : "document";
      const contenido: Record<string, unknown> = { id: up.id };
      if (caption && i === 0) contenido.caption = caption;   // una sola vez por tanda
      if (kind === "document") contenido.filename = doc.name;

      const sendRes = await fetch(`https://graph.facebook.com/v18.0/${config.phoneNumberId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messaging_product: "whatsapp", to: phone, type: kind, [kind]: contenido }),
      });
      const sent = (await sendRes.json().catch(() => ({}))) as {
        messages?: { id?: string }[];
        error?: { code?: number; message?: string };
      };
      if (!sendRes.ok) {
        const amable =
          sent.error?.code === 131047
            ? "Pasaron más de 24 h del último mensaje del cliente: WhatsApp sólo deja mandar plantillas"
            : sent.error?.code === 131030
              ? "Tu número de prueba sólo puede escribirle a los contactos registrados"
              : "WhatsApp rechazó el envío";
        fallidos.push({ id: docId, nombre: doc.name, error: amable });
        continue;
      }

      // 3) Queda en el historial del inbox, como cualquier mensaje del negocio.
      await WhatsAppMessagesDB.append(auth.tenantId, {
        phoneNumberId: config.phoneNumberId,
        customerPhone: phone,
        direction: "out",
        sentBy: "admin",
        body: esImagen ? `📷 ${doc.name}` : `📄 ${doc.name}`,
        waMessageId: sent.messages?.[0]?.id ?? null,
        mediaId: up.id,
        mediaMime: mime,
        status: "sent",
      });

      // El envío queda en la auditoría del documento: quién lo mandó y a qué
      // número. Es lo que se pregunta cuando un cliente dice "no me llegó".
      DocumentsDB.log(auth.tenantId, {
        documentId: docId,
        actorId: auth.username,
        action: "whatsapp_send",
        metadata: { telefono: redactPhone(phone), tipo: kind },
      }).catch((err) => logger.warn("documents.audit.fail", { err: String(err) }));

      enviados.push({ id: docId, nombre: doc.name });
    } catch (e) {
      logger.error("[whatsapp/send-document] error", {
        tenantId: auth.tenantId, err: e instanceof Error ? e.message : String(e),
      });
      fallidos.push({ id: docId, nombre: doc.name, error: "No se pudo enviar" });
    }
  }

  logger.info("[whatsapp/send-document] tanda", {
    tenantId: auth.tenantId, to: redactPhone(phone), enviados: enviados.length, fallidos: fallidos.length,
  });
  return NextResponse.json({ enviados, fallidos }, { status: enviados.length > 0 ? 201 : 422 });
}
