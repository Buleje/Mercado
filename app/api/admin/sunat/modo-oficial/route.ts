import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { getModoOficialState } from "@/lib/sunat/modo-oficial";
import { newTraceId, toErrorPayload } from "@/lib/api-error";

/**
 * GET /api/admin/sunat/modo-oficial
 *
 * Devuelve el estado del Modo SUNAT Oficial para el tenant (solo lectura).
 * El admin del negocio VE el estado y los bloqueos pendientes, pero NO puede
 * encenderlo — el toggle es manual por superadmin (ver ruta superadmin).
 */
export async function GET(req: NextRequest) {
  const traceId = newTraceId();
  try {
    const auth = await requireAdmin(req, ["admin", "cajero", "manager"]);
    if (auth instanceof NextResponse) return auth;

    const state = await getModoOficialState(auth.tenantId);
    return NextResponse.json({ ok: true, state });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json({ ok: false, ...payload }, { status });
  }
}
