import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { DocumentsDB } from "@/lib/db/documents.db";
import { downloadFromStorage } from "@/lib/documents/storage";

/**
 * GET /api/public/folders/[token]/docs/[docId]/raw — sirve un documento que pertenece
 * a la carpeta compartida (same-origin, ?download=1 = attachment). Valida que el doc
 * sea de la carpeta del token.
 */
type Ctx = { params: Promise<{ token: string; docId: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const rl = await applyRateLimit(req, "MODERATE", "public:folder:doc");
    if (rl) return rl;
    const { token, docId } = await ctx.params;
    const doc = await DocumentsDB.getFolderShareDocPath(token, docId);
    if (!doc) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const buf = await downloadFromStorage(doc.storagePath);
    if (!buf) return NextResponse.json({ error: "storage_unavailable" }, { status: 502 });

    const safeName = doc.name.replace(/[^\w.-]+/g, "_") || "documento";
    const disposition = req.nextUrl.searchParams.get("download") === "1" ? "attachment" : "inline";
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": doc.mimeType || "application/octet-stream",
        "Content-Disposition": `${disposition}; filename="${safeName}"`,
        "Content-Length": String(buf.length),
        "Cache-Control": "private, max-age=60",
        "X-Frame-Options": "SAMEORIGIN",
      },
    });
  } catch (e) {
    logger.error("[public.folder.doc] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
