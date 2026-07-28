import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { ContractsDB } from "@/lib/db/contracts.db";
import { revisarContrato } from "@/lib/contratos/revisar-contrato";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

/**
 * Revisa el contrato antes de firmarlo y guarda el informe en el propio
 * contrato, así queda constancia de qué se sabía al momento de firmar.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const _rl = await applyRateLimit(req, "STRICT", "contratos-revisar");
  if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  try {
    const contrato = await ContractsDB.getById(auth.tenantId, id);
    if (!contrato) return NextResponse.json({ error: "Contrato no encontrado" }, { status: 404 });

    const revision = await revisarContrato(contrato);
    await ContractsDB.update(auth.tenantId, id, { revisionIa: revision });
    await ContractsDB.addEvent(
      auth.tenantId,
      id,
      "REVISADO_IA",
      `Revisión ${revision.fuente === "ia" ? "con IA" : "por reglas"}: ${revision.riesgos.length} punto(s), puntaje ${revision.puntaje}`,
      auth.username,
    );

    return NextResponse.json({ ok: true, revision });
  } catch (e) {
    logger.error("[contratos/revisar] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "No se pudo revisar el contrato" }, { status: 500 });
  }
}
