import { NextResponse, type NextRequest } from "next/server";
import { ContabilidadDB } from "@/lib/db/contabilidad.db";
import { AjustesSchema } from "@/lib/contabilidad/esquemas";
import { auditar, leerBody, responder, sesion } from "../_comun";

/** GET /api/admin/contabilidad/ajustes — IGV, inicio, cuentas cambiadas y las reglas. */
export async function GET(req: NextRequest) {
  const s = await sesion(req);
  if (s instanceof NextResponse) return s;
  return responder("ajustes", s, () => ContabilidadDB.ajustes(s.tenantId));
}

/** PUT /api/admin/contabilidad/ajustes — solo admin y dueño. */
export async function PUT(req: NextRequest) {
  const s = await sesion(req, true);
  if (s instanceof NextResponse) return s;
  const b = await leerBody(req, AjustesSchema);
  if (b instanceof NextResponse) return b;
  return responder("ajustes/guardar", s, async () => {
    const r = await ContabilidadDB.guardarAjustes(s.tenantId, b, s.username);
    auditar(req, s, "UPDATE", `ajustes: ${JSON.stringify(b)}`);
    return r;
  });
}
