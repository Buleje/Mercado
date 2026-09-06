import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { DocumentsDB } from "@/lib/db/documents.db";
import { downloadFromStorage, esInlineSeguro } from "@/lib/documents/storage";

/**
 * GET /api/public/documents/[token]/raw — sirve el archivo compartido desde NUESTRO
 * origen (same-origin), para que la página pública `/firmar` o `/d` lo pueda mostrar
 * en un iframe. La URL firmada de Supabase llega con X-Frame-Options y el navegador la
 * bloquea; este proxy no. Validado por token de share (+ password si la tiene).
 */
type Ctx = { params: Promise<{ token: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const rl = await applyRateLimit(req, "MODERATE", "documents:public:raw");
    if (rl) return rl;

    const { token } = await ctx.params;
    const found = await DocumentsDB.findByShareToken(token);
    if (!found) return NextResponse.json({ error: "not_found_or_expired" }, { status: 404 });

    if (found.share.hasPassword) {
      const password = req.nextUrl.searchParams.get("password") ?? "";
      const stored = await DocumentsDB.getShareRawPassword(token);
      if (!DocumentsDB.verifySharePassword(stored, password)) {
        return NextResponse.json({ error: "password_required" }, { status: 401 });
      }
    }

    const buf = await downloadFromStorage(found.doc.storagePath);
    if (!buf) return NextResponse.json({ error: "storage_unavailable" }, { status: 502 });

    const safeName = found.doc.name.replace(/[^\w.-]+/g, "_") || "documento";
    // Un link público que sirve un SVG/HTML inline ejecuta scripts en NUESTRO
    // dominio para cualquiera que abra el link: lo que no es seguro de mostrar
    // se baja, no se abre.
    const pidenDescarga = req.nextUrl.searchParams.get("download") === "1";
    const disposition = pidenDescarga || !esInlineSeguro(found.doc.mimeType, found.doc.name) ? "attachment" : "inline";
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": found.doc.mimeType || "application/octet-stream",
        "Content-Disposition": `${disposition}; filename="${safeName}"`,
        "Content-Length": String(buf.length),
        "Cache-Control": "private, max-age=60",
        "X-Frame-Options": "SAMEORIGIN",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    logger.error("[public.documents.raw] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
