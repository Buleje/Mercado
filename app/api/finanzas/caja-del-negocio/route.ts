import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { RUTAS_PANEL } from "@/lib/auth/roles-rutas-panel";
import { ResultadoNegocioDB, hoyDeLima } from "@/lib/db/resultado-negocio.db";
import { esMesDelNegocio } from "@/lib/finance/resultado-del-negocio";
import { logger } from "@/lib/logger";
import { soloAdminODueno } from "@/lib/forestal/plata-de-guia-rol";
import { RRHH_COMPLETO } from "@/lib/rrhh/roles";

/**
 * GET /api/finanzas/caja-del-negocio?mes=YYYY-MM — lo que entró y salió en el
 * mes, sin dobles, y lo que viene (ADR-451): `RespuestaCaja`
 * `{ caja, viene, generadoEn }`. `viene` es el estado de HOY (lo que te deben,
 * lo que debes, lo que se cruza), no depende del mes pedido. Sólo lectura.
 */

const Query = z.object({
  mes: z.string().refine(esMesDelNegocio, "mes debe ser YYYY-MM, entre 2000 y 2100").optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, RUTAS_PANEL["/api/finanzas/caja-del-negocio"]);
  if (auth instanceof NextResponse) return auth;
  // ADR-451 §Roles: sólo admin y dueño — `requireAdmin` deja pasar al encargado por el
  // management-tier, así que se lo corta acá (mismo criterio que Liquidar).
  const noEsDueno = soloAdminODueno(auth.role, "ver la caja del negocio");
  if (noEsDueno) return noEsDueno;
  // Lo ganado de RRHH sólo para quien lo ve en RRHH (ADR-414 §7).
  const opciones = { verPlanilla: RRHH_COMPLETO.includes(auth.role) };

  const q = Query.safeParse({ mes: new URL(req.url).searchParams.get("mes") || undefined });
  if (!q.success) {
    return NextResponse.json({ error: q.error.issues[0]?.message ?? "Parámetros inválidos" }, { status: 400 });
  }

  const { hoy, mes: mesDeHoy } = hoyDeLima();
  try {
    return NextResponse.json(await ResultadoNegocioDB.caja(auth.tenantId, q.data.mes ?? mesDeHoy, hoy, opciones));
  } catch (err) {
    logger.error("[finanzas/caja-del-negocio] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "No se pudo armar la caja del mes" }, { status: 500 });
  }
}
