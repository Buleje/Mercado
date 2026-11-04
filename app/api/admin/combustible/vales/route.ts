import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";
import { CuadernoCombustibleDB } from "@/lib/db/cuaderno-combustible.db";
import { ROLES_ANOTAR, fechaDelRenglon, leerCuerpo, valeSchema } from "../esquemas";

/** POST /api/admin/combustible/vales — vale de salida por máquina (horómetro, galones, operador, firma). ADR-533. */
export const POST = withApiHandler("admin-combustible-vale", async (req: NextRequest) => {
  const rl = await applyRateLimit(req, "GENEROUS", "admin-combustible");
  if (rl) return rl;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const auth = await requireAdmin(req, ROLES_ANOTAR);
  if (auth instanceof NextResponse) return auth;
  const b = await leerCuerpo(req, valeSchema);
  if (!b.ok) return b.res;
  const fecha = fechaDelRenglon(b.data.fecha, b.data.hora);
  if (!(fecha instanceof Date)) return NextResponse.json({ error: fecha.error, campo: "fecha" }, { status: 400 });
  try {
    const r = await CuadernoCombustibleDB.crearVale(
      auth.tenantId,
      {
        fecha, maquinaId: b.data.maquinaId, horometro: b.data.horometro ?? null, galones: b.data.galones,
        operador: b.data.operador, firma: b.data.firma ?? null, notas: b.data.notas,
      },
      auth.username,
    );
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ data: r }, { status: 201 });
  } catch (err) {
    logger.error("[combustible.vale] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
});
