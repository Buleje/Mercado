import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { DocumentsDB } from "@/lib/db/documents.db";
import { downloadFromStorage } from "@/lib/documents/storage";

/**
 * GET /api/admin/documents/[id]/raw — sirve el archivo del documento desde NUESTRO
 * origen. La vista previa antes iframeaba la URL firmada de Supabase directamente,
 * que llega con X-Frame-Options → el navegador la bloquea ("contenido bloqueado").
 * Acá lo descargamos server-side (SDK, sin CORS) y lo devolvemos same-origin e
 * `inline`, así el modal lo puede mostrar (vía blob URL, inmune a X-Frame-Options).
 * Auth + aislamiento por tenant iguales que el resto de /documents.
 */
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const rl = await applyRateLimit(req, "MODERATE", "documents:raw");
    if (rl) return rl;
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const { id } = await ctx.params;
    const doc = await DocumentsDB.getById(auth.tenantId, id, auth.role);
    if (!doc) return NextResponse.json({ error: "not_found" }, { status: 404 });

    // El contenido cambia cuando se sube/edita una versión, y `storagePath`
    // cambia con ella: sirve de validador. Con `no-cache` el navegador siempre
    // pregunta, pero se ahorra el cuerpo si nada cambió (304).
    // Antes esto era `max-age=60` a secas: tras guardar una edición, recargar
    // dentro del minuto mostraba el archivo VIEJO y parecía que el guardado se
    // había perdido.
    const etag = `"${Buffer.from(`${doc.storagePath}:${doc.size}`).toString("base64url").slice(0, 32)}"`;
    if (req.headers.get("if-none-match") === etag) {
      return new NextResponse(null, {
        status: 304,
        headers: { ETag: etag, "Cache-Control": "private, no-cache" },
      });
    }

    const buf = await downloadFromStorage(doc.storagePath);
    if (!buf) return NextResponse.json({ error: "storage_unavailable" }, { status: 502 });

    const safeName = doc.name.replace(/[^\w.-]+/g, "_") || "documento";
    // ?download=1 → fuerza la descarga (attachment); por defecto se muestra inline
    // (para la vista previa dentro del modal).
    const disposition = req.nextUrl.searchParams.get("download") === "1" ? "attachment" : "inline";
    // Los documentos con permisos restringidos NO se cachean en el navegador
    // (evita servir contenido cacheado tras cambiar de sesión en un equipo compartido).
    const cache = doc.allowedRoles.length > 0 ? "private, no-store" : "private, no-cache";
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": doc.mimeType || "application/octet-stream",
        "Content-Disposition": `${disposition}; filename="${safeName}"`,
        "Content-Length": String(buf.length),
        "Cache-Control": cache,
        ETag: etag,
        "X-Frame-Options": "SAMEORIGIN",
      },
    });
  } catch (e) {
    logger.error("[documents.raw] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
