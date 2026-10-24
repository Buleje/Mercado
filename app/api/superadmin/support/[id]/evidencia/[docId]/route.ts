import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { SupportTicketsDB } from "@/lib/db/support-tickets.db";
import { DocumentsDB } from "@/lib/db/documents.db";
import { downloadFromStorage, esInlineSeguro } from "@/lib/documents/storage";
import { extensionDe } from "@/lib/documents/upload-limits";
import { extensionDeMime } from "@/lib/grabadora/formato";
import { applyRateLimit } from "@/lib/rate-limit";
import { logSuperadminAction } from "@/lib/audit/superadmin-audit";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { EQUIPO_BULEJE, leerDetalleCorreccion } from "@/lib/soporte/correccion-guia";

/**
 * GET /api/superadmin/support/[id]/evidencia/[docId] — ADR-512: el superadmin
 * abre UNA foto/PDF que el negocio adjuntó a SU solicitud de corrección.
 *
 * Sólo sirve un `docId` que esté en el `detalle.documentoIds` de ESA solicitud,
 * leído con el `tenantId` de la solicitud: cualquier otro documento del negocio
 * —aunque exista— es 404, igual que una solicitud que no es de corrección.
 * Privado (`Cache-Control: private, no-store`, sin enlace público); inline sólo
 * lo que es seguro mostrar (`esInlineSeguro`: imagen/PDF), el resto se baja.
 * CSP que no deja correr nada (salvo al PDF: el visor del navegador la necesita).
 * Cada vista queda en el registro del superadmin (con su usuario) y en el del
 * negocio como «Equipo Buleje» (Ley 29733: el titular sabe quién vio sus datos;
 * el usuario de entrada del superadmin no sale de la plataforma).
 *
 * CSRF: es un GET que se abre con `<a href>` (el navegador no manda cabeceras
 * propias), como el GET vecino de la bandeja. Lo cubren la cookie de plataforma
 * `SameSite=Strict` (un sitio ajeno no la lleva) y `Sec-Fetch-Site: cross-site`
 * → 403. No escribe nada salvo el registro de la vista.
 *
 * 200 binario | 401 | 403 | 404 | 429 | 502 (almacenamiento).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> },
): Promise<Response> {
  const rl = applyRateLimit(req, "MODERATE", "sa-support-evidencia");
  if (rl) return rl;

  if (req.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  }
  const auth = await requirePlatformAPI(req);
  if ("status" in auth) return auth;

  const { id, docId } = await params;
  const noEsta = () => NextResponse.json({ error: "Ese documento no es evidencia de esta solicitud" }, { status: 404 });

  try {
    const ticket = await SupportTicketsDB.obtener(id);
    if (!ticket || ticket.kind !== "correccion_guia") return noEsta();
    const ids = leerDetalleCorreccion(ticket.detalle)?.documentoIds ?? [];
    if (!ids.includes(docId)) return noEsta();

    const tenantId = ticket.tenantId;
    const doc = await DocumentsDB.getById(tenantId, docId);
    if (!doc) return noEsta();
    const buf = await downloadFromStorage(doc.storagePath);
    if (!buf) return NextResponse.json({ error: "No se pudo leer el archivo del almacenamiento" }, { status: 502 });

    const detalle = `Vio la evidencia «${doc.name}» de la corrección de la guía ${leerDetalleCorreccion(ticket.detalle)?.guiaNumero ?? ""}`.trim();
    logSuperadminAction("support_evidencia_ver", detalle, { ticketId: id, tenantId, docId }, auth.username).catch((err) =>
      logger.error("[superadmin/support/evidencia] audit superadmin falló", { error: String(err) }),
    );
    logActivity(
      "soporte_correccion_evidencia_vista",
      "Document",
      `${detalle} (${EQUIPO_BULEJE})`,
      docId,
      EQUIPO_BULEJE,
      undefined,
      tenantId,
    ).catch((err) => logger.error("[superadmin/support/evidencia] activity log falló", { error: String(err), tenantId }));

    const base = doc.name.replace(/[^\w.-]+/g, "_") || "documento";
    const sinExtension = !extensionDe(base) && (doc.mimeType ?? "").startsWith("audio/");
    const nombre = sinExtension ? `${base}.${extensionDeMime(doc.mimeType)}` : base;
    const disposition = esInlineSeguro(doc.mimeType, doc.name) ? "inline" : "attachment";
    const esPdf = (doc.mimeType ?? "").toLowerCase() === "application/pdf";
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": doc.mimeType || "application/octet-stream",
        "Content-Disposition": `${disposition}; filename="${nombre}"`,
        "Content-Length": String(buf.length),
        "Cache-Control": "private, no-store",
        "X-Frame-Options": "SAMEORIGIN",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        ...(esPdf ? {} : { "Content-Security-Policy": "default-src 'none'; img-src 'self'; media-src 'self'" }),
      },
    });
  } catch (err) {
    logger.error("[superadmin/support/evidencia] error", { error: String(err) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
