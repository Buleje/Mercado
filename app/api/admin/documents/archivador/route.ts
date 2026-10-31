import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { DocumentosArchivadorDB } from "@/lib/db/documentos-archivador.db";

/**
 * «Ordenar el archivador con el celular» (31-10): los papeles con código del
 * negocio y dónde va cada original, para juzgar cada sticker en el celular.
 * Sólo lectura; el marcado sigue yendo por `PATCH /codigo-fisico`. Mismos
 * roles que la lista del Archivo (todo el panel) y sólo lo que el rol ve; el
 * negocio sale del JWT.
 */
export async function GET(req: NextRequest) {
  try {
    const rl = applyRateLimit(req, "DRIVE_READ", "documents:archivador");
    if (rl) return rl;
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const papeles = await DocumentosArchivadorDB.papelesConCodigo(auth.tenantId, auth.role);
    return NextResponse.json({ papeles }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    logger.error("[documents/archivador] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
