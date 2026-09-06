import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { DocumentsDB } from "@/lib/db/documents.db";

/**
 * GET /api/public/folders/[token] — vista pública de una carpeta compartida:
 * nombre de la carpeta + sus documentos directos. Validado por token.
 */
type Ctx = { params: Promise<{ token: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const rl = await applyRateLimit(req, "MODERATE", "public:folder");
    if (rl) return rl;
    const { token } = await ctx.params;
    const found = await DocumentsDB.findByFolderShareToken(token);
    if (!found) return NextResponse.json({ error: "not_found_or_expired" }, { status: 404 });

    if (found.hasPassword) {
      const stored = await DocumentsDB.getFolderShareRawPassword(token);
      const intento = req.nextUrl.searchParams.get("password") ?? "";
      if (!DocumentsDB.verifySharePassword(stored, intento)) {
        return NextResponse.json({ error: "password_required", requirePassword: true }, { status: 401 });
      }
    }

    DocumentsDB.incrementFolderShareAccess(token).catch((err) => logger.warn("folder.share.increment_fail", { err: String(err) }));
    return NextResponse.json({ folder: found.folder, docs: found.docs, expiresAt: found.expiresAt, hasPassword: found.hasPassword });
  } catch (e) {
    logger.error("[public.folder] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
