import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { withApiHandler } from "@/lib/api-handler";
import { isSpecializationEnabled } from "@/lib/specializations";
import { ROLES_PAPELES_GUIA } from "@/lib/forestal/documentos-guia";
import { papelesPendientes } from "@/lib/forestal/papeles-pendientes";

/**
 * GET — cuántas guías de ingreso no tienen sus papeles de ley (ADR-482), para
 * el aviso del Inicio forestal. SÓLO LECTURA. Mismos roles que los papeles de
 * la guía (admin · almacenero · dueño): el cajero recibe 403 y el aviso no se pinta.
 */
export const GET = withApiHandler("forestal-papeles-pendientes-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ROLES_PAPELES_GUIA);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "DRIVE_READ", "forestal-papeles-pendientes");
  if (rl) return rl;
  if (!(await isSpecializationEnabled(auth.tenantId, "spec:forestal:ctp-libro"))) {
    return NextResponse.json(
      { error: "specialization_disabled", message: "El Libro CTP no está habilitado para esta tienda." },
      { status: 403 },
    );
  }
  return NextResponse.json(await papelesPendientes(auth.tenantId, auth.role));
});
