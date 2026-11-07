import { NextResponse, type NextRequest } from "next/server";
import { ContabilidadDB } from "@/lib/db/contabilidad.db";
import { responder, sesion } from "../_comun";

/** GET /api/admin/contabilidad/periodos — los meses desde el inicio, con su estado y si cuadran (ADR-529). */
export async function GET(req: NextRequest) {
  const s = await sesion(req);
  if (s instanceof NextResponse) return s;
  return responder("periodos", s, () => ContabilidadDB.periodos(s.tenantId, s.hoy, s.opciones));
}
