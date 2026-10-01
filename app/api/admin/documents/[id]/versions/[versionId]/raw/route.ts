import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { DocumentsDB } from "@/lib/db/documents.db";
import { downloadFromStorage } from "@/lib/documents/storage";

/**
 * GET /api/admin/documents/[id]/versions/[versionId]/raw — sirve el archivo de una
 * versión histórica puntual, same-origin (para verla en iframe o descargarla).
 * ?download=1 fuerza la descarga. Auth + aislamiento por tenant.
 */
type Ctx = { params: Promise<{ id: string; versionId: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const rl = await applyRateLimit(req, "DRIVE_READ", "documents:version:raw");
    if (rl) return rl;
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const { id, versionId } = await ctx.params;
    const version = await DocumentsDB.getVersion(auth.tenantId, id, versionId);
    if (!version) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const buf = await downloadFromStorage(version.storagePath);
    if (!buf) return NextResponse.json({ error: "storage_unavailable" }, { status: 502 });

    const disposition = req.nextUrl.searchParams.get("download") === "1" ? "attachment" : "inline";
    const ext = version.mimeType === "application/pdf" ? "pdf" : "bin";
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": version.mimeType || "application/octet-stream",
        "Content-Disposition": `${disposition}; filename="v${version.versionNumber}.${ext}"`,
        "Content-Length": String(buf.length),
        "Cache-Control": "private, max-age=60",
        "X-Frame-Options": "SAMEORIGIN",
      },
    });
  } catch (e) {
    logger.error("[documents.version.raw] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
