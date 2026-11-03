import { NextResponse, type NextRequest } from "next/server";
import { ContabilidadDB } from "@/lib/db/contabilidad.db";
import { CuentaPropiaSchema } from "@/lib/contabilidad/esquemas";
import { auditar, leerBody, responder, sesion } from "../_comun";

/** GET /api/admin/contabilidad/plan — PCGE 2019 + cuentas propias, y cuáles ya se usan. */
export async function GET(req: NextRequest) {
  const s = await sesion(req);
  if (s instanceof NextResponse) return s;
  return responder("plan", s, () => ContabilidadDB.plan(s.tenantId, s.hoy, s.opciones));
}

/** POST /api/admin/contabilidad/plan — cuenta propia (cuelga de una del PCGE). */
export async function POST(req: NextRequest) {
  const s = await sesion(req, true);
  if (s instanceof NextResponse) return s;
  const b = await leerBody(req, CuentaPropiaSchema);
  if (b instanceof NextResponse) return b;
  return responder("plan/crear", s, async () => {
    const c = await ContabilidadDB.crearCuenta(s.tenantId, b);
    auditar(req, s, "CREATE", `cuenta propia ${c.codigo} ${c.nombre}`, c.codigo);
    return c;
  });
}
