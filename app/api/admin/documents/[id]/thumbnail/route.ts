import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { DocumentsDB } from "@/lib/db/documents.db";
import { downloadFromStorage } from "@/lib/documents/storage";

/**
 * GET /api/admin/documents/[id]/thumbnail — miniatura PNG de la 1ª página de un PDF
 * (renderizada con unpdf + @napi-rs/canvas). Se cachea en el navegador (max-age).
 * La grilla la usa como `img src` para PDFs; si falla, la card cae al ícono.
 */
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    // GENEROUS y no MODERATE: la grilla pide UNA miniatura por documento, sin
    // que el usuario haga nada. Con 20 cada 5 min, una carpeta con 30 boletas
    // mostraba la mitad de las tarjetas rotas (ADR-306).
    const rl = await applyRateLimit(req, "GENEROUS", "documents:thumbnail");
    if (rl) return rl;
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const { id } = await ctx.params;
    const doc = await DocumentsDB.getById(auth.tenantId, id, auth.role);
    if (!doc) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (doc.mimeType !== "application/pdf") return NextResponse.json({ error: "not_pdf" }, { status: 415 });

    const buf = await downloadFromStorage(doc.storagePath);
    if (!buf) return NextResponse.json({ error: "storage_unavailable" }, { status: 502 });

    // ?page=N (1-based) → miniatura de esa página; por defecto la 1ª.
    const pageParam = Number(req.nextUrl.searchParams.get("page") || "1");
    const page = Number.isFinite(pageParam) && pageParam >= 1 ? Math.floor(pageParam) : 1;

    const { renderPageAsImage } = await import("unpdf");
    const png = await renderPageAsImage(new Uint8Array(buf), page, {
      canvasImport: () => import("@napi-rs/canvas"),
      scale: 1.2,
    });

    return new NextResponse(new Uint8Array(png as ArrayBuffer), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        // Los docs restringidos no se cachean (evita fuga por caché tras cambio de sesión).
        "Cache-Control": doc.allowedRoles.length > 0 ? "private, no-store" : "private, max-age=3600",
        "X-Frame-Options": "SAMEORIGIN",
      },
    });
  } catch (e) {
    // Un PDF corrupto o de un formato que unpdf no sabe abrir no es una falla
    // del servidor: la tarjeta cae al ícono y listo. Se loguea como warning
    // para no ensuciar Sentry con documentos rotos que subió alguien.
    logger.warn("[documents.thumbnail] no se pudo renderizar", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "thumbnail_failed" }, { status: 422 });
  }
}
