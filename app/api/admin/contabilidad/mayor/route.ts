import { NextResponse, type NextRequest } from "next/server";
import { ContabilidadDB } from "@/lib/db/contabilidad.db";
import { QueryMayor } from "@/lib/contabilidad/esquemas";
import { leerQuery, responder, sesion } from "../_comun";

/** GET /api/admin/contabilidad/mayor?mes=YYYY-MM[&cuenta=1011] — libro mayor (ADR-529). Solo lectura, del tenant de la sesión; los totales los arma el servidor. */
export async function GET(req: NextRequest) {
  const s = await sesion(req);
  if (s instanceof NextResponse) return s;
  const q = leerQuery(req, QueryMayor);
  if (q instanceof NextResponse) return q;
  return responder("mayor", s, () => ContabilidadDB.mayor(s.tenantId, q.mes, q.cuenta, s.hoy, s.opciones));
}
