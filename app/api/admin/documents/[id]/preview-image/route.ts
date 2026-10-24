import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { DocumentsDB } from "@/lib/db/documents.db";
import { downloadFromStorage } from "@/lib/documents/storage";
import { esConvertibleAImagen, rasterizarImagen } from "@/lib/documents/imagen-preview";

/**
 * GET /api/admin/documents/[id]/preview-image — la imagen, convertida a PNG.
 *
 * Para lo que el navegador no dibuja: HEIC del celular, TIFF de un escáner,
 * SVG (que además NO se puede mostrar tal cual sin ejecutar sus scripts).
 * Mismo espíritu que `/thumbnail` para PDFs, pero del lado de las imágenes.
 */
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    // GENEROUS como el thumbnail: la grilla pide una por documento sin que el
    // usuario haga nada (ADR-306).
    const rl = await applyRateLimit(req, "DRIVE_READ", "documents:preview-image");
    if (rl) return rl;
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const { id } = await ctx.params;
    const doc = await DocumentsDB.getById(auth.tenantId, id, auth.role);
    if (!doc) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (!esConvertibleAImagen(doc.name, doc.mimeType)) {
      return NextResponse.json({ error: "not_convertible" }, { status: 415 });
    }

    const buf = await downloadFromStorage(doc.storagePath);
    if (!buf) return NextResponse.json({ error: "storage_unavailable" }, { status: 502 });

    // ?max=320 para la miniatura de la grilla; el modal pide el tamaño grande.
    const maxParam = Number(req.nextUrl.searchParams.get("max") ?? "1600");
    const max = Number.isFinite(maxParam) ? Math.min(2400, Math.max(120, Math.floor(maxParam))) : 1600;

    const png = await rasterizarImagen(buf, max);
    if (!png) {
      // Archivo roto o que sharp no entiende: no es una falla del servidor, la
      // tarjeta cae al ícono. 422 para no ensuciar Sentry con 500s.
      logger.warn("[documents.preview-image] no se pudo rasterizar", { id, mime: doc.mimeType });
      return NextResponse.json({ error: "preview_failed" }, { status: 422 });
    }

    return new NextResponse(new Uint8Array(png), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        // Los restringidos no se cachean (equipo compartido, cambio de sesión).
        "Cache-Control": doc.allowedRoles.length > 0 ? "private, no-store" : "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "SAMEORIGIN",
      },
    });
  } catch (e) {
    logger.error("[documents.preview-image] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
