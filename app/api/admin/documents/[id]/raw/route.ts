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
    const doc = await DocumentsDB.getById(auth.tenantId, id);
    if (!doc) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const buf = await downloadFromStorage(doc.storagePath);
    if (!buf) return NextResponse.json({ error: "storage_unavailable" }, { status: 502 });

    const safeName = doc.name.replace(/[^\w.-]+/g, "_") || "documento";
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": doc.mimeType || "application/octet-stream",
        "Content-Disposition": `inline; filename="${safeName}"`,
        "Content-Length": String(buf.length),
        "Cache-Control": "private, max-age=60",
        "X-Frame-Options": "SAMEORIGIN",
      },
    });
  } catch (e) {
    logger.error("[documents.raw] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
