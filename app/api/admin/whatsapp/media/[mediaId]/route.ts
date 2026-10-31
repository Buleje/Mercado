import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import {
  WhatsAppMessagesDB,
  getWhatsAppConfig,
  getConfigForPhoneNumberId,
} from "@/lib/db/whatsapp-messages.db";

/**
 * GET /api/admin/whatsapp/media/[mediaId] — sirve la media entrante de WhatsApp.
 *
 * El binario vive en el CDN de Meta (~30 días): Graph devuelve una URL temporal
 * (5 min) que solo funciona con el Bearer token → este proxy la resuelve y
 * streamea al panel. Sin storage propio.
 *
 * Seguridad: requireAdmin + el mediaId debe pertenecer a un mensaje del TENANT
 * (evita que un admin ajeno lea media de otro negocio adivinando ids).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ mediaId: string }> },
) {
  const _rl = applyRateLimit(req, "GENEROUS", "admin-whatsapp-media");
  if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { mediaId } = await params;
  if (!/^\d{5,30}$/.test(mediaId)) {
    return NextResponse.json({ error: "mediaId inválido" }, { status: 400 });
  }

  // Tenancy: el media debe estar referenciado por un mensaje de ESTE tenant
  const msg = await WhatsAppMessagesDB.findByMediaId(auth.tenantId, mediaId);
  if (!msg) {
    return NextResponse.json({ error: "Media no encontrada" }, { status: 404 });
  }

  const config =
    (await getConfigForPhoneNumberId(auth.tenantId, msg.phoneNumberId)) ??
    (await getWhatsAppConfig(auth.tenantId));
  const token =
    config?.whatsappToken ||
    process.env.WHATSAPP_ACCESS_TOKEN ||
    process.env.WHATSAPP_API_TOKEN ||
    "";
  if (!token) {
    return NextResponse.json({ error: "WhatsApp no configurado" }, { status: 409 });
  }

  try {
    // 1) URL temporal del asset
    const metaRes = await fetch(`https://graph.facebook.com/v18.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!metaRes.ok) {
      logger.warn("[admin/whatsapp/media] Graph rechazó el lookup", {
        tenantId: auth.tenantId,
        status: metaRes.status,
      });
      return NextResponse.json(
        { error: "La media expiró en Meta (~30 días) o no está disponible." },
        { status: 410 },
      );
    }
    const meta = (await metaRes.json()) as { url?: string; mime_type?: string };
    if (!meta.url) {
      return NextResponse.json({ error: "Media sin URL" }, { status: 502 });
    }

    // 2) Descargar el binario (la URL temporal exige el mismo Bearer)
    const bin = await fetch(meta.url, { headers: { Authorization: `Bearer ${token}` } });
    if (!bin.ok || !bin.body) {
      return NextResponse.json({ error: "No se pudo descargar la media" }, { status: 502 });
    }

    return new NextResponse(bin.body, {
      status: 200,
      headers: {
        "Content-Type": meta.mime_type ?? msg.mediaMime ?? "application/octet-stream",
        // El admin puede recargar el hilo seguido — cache privado corto
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (e) {
    logger.error("[admin/whatsapp/media] error", {
      tenantId: auth.tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: "Error al obtener la media" }, { status: 502 });
  }
}
