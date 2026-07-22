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
    const rl = await applyRateLimit(req, "MODERATE", "documents:thumbnail");
    if (rl) return rl;
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const { id } = await ctx.params;
    const doc = await DocumentsDB.getById(auth.tenantId, id);
    if (!doc) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (doc.mimeType !== "application/pdf") return NextResponse.json({ error: "not_pdf" }, { status: 415 });

    const buf = await downloadFromStorage(doc.storagePath);
    if (!buf) return NextResponse.json({ error: "storage_unavailable" }, { status: 502 });

    const { renderPageAsImage } = await import("unpdf");
    const png = await renderPageAsImage(new Uint8Array(buf), 1, {
      canvasImport: () => import("@napi-rs/canvas"),
      scale: 1.2,
    });

    return new NextResponse(new Uint8Array(png as ArrayBuffer), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, max-age=3600",
        "X-Frame-Options": "SAMEORIGIN",
      },
    });
  } catch (e) {
    logger.error("[documents.thumbnail] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "thumbnail_failed" }, { status: 500 });
  }
}
