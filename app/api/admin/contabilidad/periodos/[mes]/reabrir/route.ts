import { NextResponse, type NextRequest } from "next/server";
import { ContabilidadDB } from "@/lib/db/contabilidad.db";
import { ESQUEMA_MES } from "@/lib/contabilidad/esquemas";
import { auditar, responder, sesion } from "../../../_comun";

/** POST /api/admin/contabilidad/periodos/<YYYY-MM>/reabrir → PeriodoResumen (ADR-529; solo admin y dueño). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ mes: string }> }) {
  const s = await sesion(req, true);
  if (s instanceof NextResponse) return s;
  const mes = ESQUEMA_MES.safeParse((await params).mes);
  if (!mes.success) return NextResponse.json({ error: "El mes va como AAAA-MM." }, { status: 400 });
  return responder("periodos/reabrir", s, async () => {
    const r = await ContabilidadDB.reabrir(s.tenantId, mes.data, s.hoy, s.opciones);
    auditar(req, s, "UPDATE", `reabrir ${mes.data}: ${r.asientos} asientos, S/ ${r.totalDebe.toFixed(2)}`, mes.data);
    return r;
  });
}
