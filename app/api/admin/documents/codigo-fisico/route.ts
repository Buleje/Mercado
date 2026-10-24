import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { DocumentsDB } from "@/lib/db/documents.db";
import { IDS_POR_LOTE } from "@/lib/documents/bulk-limits";

/**
 * ADR-516 — «Ya puse el código en el papel físico» (o lo deshago), para uno o
 * para una selección. Pueden marcarlo los mismos que editan un documento (todo
 * rol del panel), y sólo sobre lo que su rol ve: un id de un papel restringido
 * se descarta en silencio, como en el lote del drive. El negocio sale del JWT.
 */
const Body = z.object({
  ids: z.array(z.string().min(1).max(64)).min(1).max(IDS_POR_LOTE),
  puesto: z.boolean(),
});

export async function PATCH(req: NextRequest) {
  try {
    const rl = await applyRateLimit(req, "DRIVE_BULK", "documents:codigo-fisico");
    if (rl) return rl;
    const csrfFail = assertCsrf(req);
    if (csrfFail) return csrfFail;
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
    }
    const { puesto } = parsed.data;
    const ids = await DocumentsDB.idsVisibles(auth.tenantId, [...new Set(parsed.data.ids)], auth.role);
    const cambiados = await DocumentsDB.marcarCodigoFisico(auth.tenantId, ids, puesto, auth.username);

    if (cambiados.length > 0) {
      DocumentsDB.logMany(
        auth.tenantId,
        cambiados.map((c) => c.id),
        { actorId: auth.username, action: "codigo_fisico", metadata: { puesto, total: cambiados.length } },
      ).catch((err) => logger.warn("documents.audit.fail", { err: String(err) }));
    }

    return NextResponse.json({
      ok: true,
      actualizados: cambiados.length,
      ids: cambiados.map((c) => c.id),
      codigoFisicoAt: puesto ? new Date().toISOString() : null,
      codigoFisicoPor: puesto ? auth.username : null,
    });
  } catch (e) {
    logger.error("[documents/codigo-fisico] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
