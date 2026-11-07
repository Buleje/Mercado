import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";
import { CuentasMovimientosDB } from "@/lib/db/cuentas-movimientos.db";
import { PERIODOS_CUENTAS } from "@/lib/finance/cuentas-tipos";
import { ROLES_CUENTAS, rangoDelPeriodo } from "@/lib/finance/cuentas-del-periodo";

/**
 * GET /api/admin/finanzas/cuentas?periodo=semana|mes|todo — «Cuentas» (ADR-527):
 * todo lo que entró y salió en el periodo (adelantos dados, gastos, ingresos)
 * con persona, detalle y hora, los totales y lo que le deben al negocio hoy.
 * Sin `periodo` → semana. Solo lectura, del tenant de la sesión; los totales los
 * arma el servidor (`lib/finance/cuentas-del-periodo.ts`).
 */

const Query = z.object({ periodo: z.enum(PERIODOS_CUENTAS).default("semana") });

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, [...ROLES_CUENTAS]);
  if (auth instanceof NextResponse) return auth;

  const sp = new URL(req.url).searchParams;
  // Un parámetro vacío (`?periodo=`) es «no mandado».
  const q = Query.safeParse({ periodo: sp.get("periodo") || undefined });
  if (!q.success) {
    return NextResponse.json({ error: "periodo debe ser semana, mes o todo" }, { status: 400 });
  }

  try {
    return NextResponse.json(await CuentasMovimientosDB.delPeriodo(auth.tenantId, rangoDelPeriodo(q.data.periodo)));
  } catch (e) {
    logger.error("[finanzas/cuentas] GET error", { err: e instanceof Error ? e.message : String(e), tenantId: auth.tenantId });
    return NextResponse.json({ error: "Error del servidor" }, { status: 503 });
  }
}
