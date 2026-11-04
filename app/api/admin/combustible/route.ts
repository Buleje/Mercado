import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";
import { CuadernoCombustibleDB } from "@/lib/db/cuaderno-combustible.db";
import { ROLES_ANOTAR, ROLES_ANULAR, configSchema, leerCuerpo } from "./esquemas";

/**
 * /api/admin/combustible — cuaderno de combustible en cilindros (ADR-533).
 *
 * GET → { ingresos, vales, conteos, config, maquinas, siguienteCilindro } (todo el cuaderno: las cuentas las hace la pantalla con `lib/combustible/cuaderno.ts`)
 * PUT → lo declarado a SUNAT (producto, gal por cilindro, máx. cilindros, cupo anual, proyección, responsable)
 */

export const GET = withApiHandler("admin-combustible-get", async (req: NextRequest) => {
  const rl = await applyRateLimit(req, "GENEROUS", "admin-combustible");
  if (rl) return rl;
  const auth = await requireAdmin(req, ROLES_ANOTAR);
  if (auth instanceof NextResponse) return auth;
  try {
    return NextResponse.json({ data: await CuadernoCombustibleDB.completo(auth.tenantId) });
  } catch (err) {
    logger.error("[combustible.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
});

export const PUT = withApiHandler("admin-combustible-config", async (req: NextRequest) => {
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const auth = await requireAdmin(req, ROLES_ANULAR);
  if (auth instanceof NextResponse) return auth;
  const b = await leerCuerpo(req, configSchema);
  if (!b.ok) return b.res;
  try {
    return NextResponse.json({ data: await CuadernoCombustibleDB.guardarConfig(auth.tenantId, b.data, auth.username) });
  } catch (err) {
    logger.error("[combustible.PUT] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
});
