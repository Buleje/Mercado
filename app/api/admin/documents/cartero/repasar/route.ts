import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { logger } from "@/lib/logger";
import { DocumentsDB } from "@/lib/db/documents.db";
import { correrCartero, entidadesDelNegocio } from "@/lib/documentos/cartero-server";
import type { EstadoCartero } from "@/lib/documentos/cartero";

/**
 * POST /api/admin/documents/cartero/repasar — pasa el cartero de papeles por
 * los documentos ya subidos que nunca lo vieron (sin `ocrMetadata.cartero`),
 * de a 50 por llamada. La pantalla repite mientras `quedan > 0` (y corta si un
 * lote vuelve con todo `fallidos`). Lo que eligió una persona no se toca.
 */

const LOTE = 50;
const EN_PARALELO = 5;

export async function POST(req: NextRequest) {
  try {
    const rl = await applyRateLimit(req, "MODERATE", "documents:cartero-repasar");
    if (rl) return rl;
    // admin/owner (y manager: el managementTier pasa por encima de la lista; security 06-11).
    const auth = await requireAdmin(req, ["admin", "owner"]);
    if (auth instanceof NextResponse) return auth;
    const csrfFail = assertCsrf(req);
    if (csrfFail) return csrfFail;

    const ids = await DocumentsDB.idsSinCartero(auth.tenantId, LOTE);
    const cuenta: Record<EstadoCartero, number> = { seguro: 0, duda: 0, nadie: 0 };
    let fallidos = 0;
    if (ids.length) {
      const entidades = await entidadesDelNegocio(auth.tenantId);
      for (let i = 0; i < ids.length; i += EN_PARALELO) {
        const tanda = await Promise.all(
          ids.slice(i, i + EN_PARALELO).map((docId) =>
            correrCartero(auth.tenantId, docId, entidades).catch((err) => {
              logger.error("[cartero] repasar un papel falló", { docId, error: String(err) });
              return null;
            }),
          ),
        );
        for (const c of tanda) {
          if (c) cuenta[c.estado] += 1;
          else fallidos += 1;
        }
      }
    }
    const quedan = ids.length ? await DocumentsDB.contarSinCartero(auth.tenantId) : 0;
    return NextResponse.json({
      ok: true,
      revisados: ids.length,
      seguros: cuenta.seguro,
      dudas: cuenta.duda,
      nadie: cuenta.nadie,
      fallidos,
      quedan,
    });
  } catch (err) {
    logger.error("documents.cartero.repasar_fail", { error: String(err) });
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
