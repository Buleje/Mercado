import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { DocumentsDB } from "@/lib/db/documents.db";
import { logger } from "@/lib/logger";

/**
 * GET /api/admin/documents/uso — cuántas veces se abrió cada papel en los
 * últimos 90 días (`{ uso: { [docId]: { vistas, ultima } } }`). Lo usa la
 * pestaña «Esenciales» de Documentos para ordenar sus carpetas por uso y
 * mostrar «lo que más abres». Sólo papeles vivos que el rol ve.
 */

const DIAS = 90;

export async function GET(req: NextRequest) {
  try {
    const rl = applyRateLimit(req, "GENEROUS", "documents:uso");
    if (rl) return rl;
    const csrfFail = assertCsrf(req);
    if (csrfFail) return csrfFail;
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const porDoc = await DocumentsDB.vistasPorDocumento(auth.tenantId, DIAS, auth.role);
    const uso: Record<string, { vistas: number; ultima: string | null }> = {};
    for (const [id, u] of Object.entries(porDoc)) uso[id] = { vistas: u.vistas, ultima: u.ultima };
    return NextResponse.json({ uso, dias: DIAS });
  } catch (e) {
    logger.error("[documents.uso] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
