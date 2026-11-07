import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";
import { CuadernoCombustibleDB } from "@/lib/db/cuaderno-combustible.db";
import { ROLES_ANOTAR, conteoSchema, fechaDelRenglon, leerCuerpo } from "../esquemas";

/** POST /api/admin/combustible/conteos — conteo físico (cilindros y galones contados contra el cuaderno). ADR-533. */
export const POST = withApiHandler("admin-combustible-conteo", async (req: NextRequest) => {
  const rl = await applyRateLimit(req, "GENEROUS", "admin-combustible");
  if (rl) return rl;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const auth = await requireAdmin(req, ROLES_ANOTAR);
  if (auth instanceof NextResponse) return auth;
  const b = await leerCuerpo(req, conteoSchema);
  if (!b.ok) return b.res;
  const fecha = fechaDelRenglon(b.data.fecha, b.data.hora);
  if (!(fecha instanceof Date)) return NextResponse.json({ error: fecha.error, campo: "fecha" }, { status: 400 });
  try {
    const r = await CuadernoCombustibleDB.crearConteo(
      auth.tenantId,
      { fecha, cilindros: b.data.cilindros, galones: b.data.galones, contadoPor: b.data.contadoPor, testigo: b.data.testigo, notas: b.data.notas },
      auth.username,
    );
    return NextResponse.json({ data: r }, { status: 201 });
  } catch (err) {
    logger.error("[combustible.conteo] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
});
