import { NextResponse, type NextRequest } from "next/server";
import { ContabilidadDB } from "@/lib/db/contabilidad.db";
import { responder, sesion } from "../_comun";

/** GET /api/admin/contabilidad/apertura-sugerida — borrador de apertura (por cobrar, por pagar y capital). No escribe. */
export async function GET(req: NextRequest) {
  const s = await sesion(req);
  if (s instanceof NextResponse) return s;
  return responder("apertura-sugerida", s, () => ContabilidadDB.aperturaSugerida(s.tenantId));
}
