import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";
import { CuadernoCombustibleDB } from "@/lib/db/cuaderno-combustible.db";
import { ROLES_ANOTAR, fechaDelRenglon, ingresoSchema, leerCuerpo } from "../esquemas";

/** POST /api/admin/combustible/ingresos — ingreso de cilindros (compra con factura o stock inicial). ADR-533. */
export const POST = withApiHandler("admin-combustible-ingreso", async (req: NextRequest) => {
  const rl = await applyRateLimit(req, "GENEROUS", "admin-combustible");
  if (rl) return rl;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const auth = await requireAdmin(req, ROLES_ANOTAR);
  if (auth instanceof NextResponse) return auth;
  const b = await leerCuerpo(req, ingresoSchema);
  if (!b.ok) return b.res;
  const fecha = fechaDelRenglon(b.data.fecha, b.data.hora);
  if (!(fecha instanceof Date)) return NextResponse.json({ error: fecha.error, campo: "fecha" }, { status: 400 });
  try {
    const { hora: _h, fecha: _f, ...resto } = b.data;
    const r = await CuadernoCombustibleDB.crearIngreso(
      auth.tenantId,
      { ...resto, fecha, grifoRuc: resto.grifoRuc ?? null, precioGal: resto.precioGal ?? null, monto: resto.monto ?? null },
      auth.username,
    );
    return NextResponse.json({ data: r }, { status: 201 });
  } catch (err) {
    logger.error("[combustible.ingreso] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
});
