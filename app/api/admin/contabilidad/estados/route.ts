import { NextResponse, type NextRequest } from "next/server";
import { ContabilidadDB } from "@/lib/db/contabilidad.db";
import { QueryMes } from "@/lib/contabilidad/esquemas";
import { leerQuery, responder, sesion } from "../_comun";

/** GET /api/admin/contabilidad/estados?mes=YYYY-MM — situación, resultados y cruce con «Resultado» (ADR-529). Solo lectura, del tenant de la sesión; los totales los arma el servidor. */
export async function GET(req: NextRequest) {
  const s = await sesion(req);
  if (s instanceof NextResponse) return s;
  const q = leerQuery(req, QueryMes);
  if (q instanceof NextResponse) return q;
  return responder("estados", s, () => ContabilidadDB.estados(s.tenantId, q.mes, s.hoy, s.opciones));
}
