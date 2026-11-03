import { NextResponse, type NextRequest } from "next/server";
import { ContabilidadDB } from "@/lib/db/contabilidad.db";
import { AsientoManualSchema } from "@/lib/contabilidad/esquemas";
import { auditar, leerBody, responder, sesion } from "../_comun";

/** POST /api/admin/contabilidad/asientos — asiento a mano o de apertura (409 si no cuadra o el mes está cerrado). */
export async function POST(req: NextRequest) {
  const s = await sesion(req, true);
  if (s instanceof NextResponse) return s;
  const b = await leerBody(req, AsientoManualSchema);
  if (b instanceof NextResponse) return b;
  return responder("asientos", s, async () => {
    const a = await ContabilidadDB.crearManual(s.tenantId, b, s.username);
    auditar(req, s, "CREATE", `asiento ${a.tipo} ${a.fecha} S/ ${a.total.toFixed(2)}: ${a.glosa}`, a.id);
    return a;
  });
}
