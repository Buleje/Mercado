import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { RUTAS_PANEL } from "@/lib/auth/roles-rutas-panel";
import { ResultadoNegocioDB, hoyDeLima } from "@/lib/db/resultado-negocio.db";
import { FUENTES_DETALLE, esMesDelNegocio } from "@/lib/finance/resultado-del-negocio";
import { logger } from "@/lib/logger";
import { soloAdminODueno } from "@/lib/forestal/plata-de-guia-rol";
import { RRHH_COMPLETO } from "@/lib/rrhh/roles";

/**
 * GET /api/finanzas/resultado/detalle?mes=YYYY-MM&fuente=<FuenteDetalle> (ADR-451).
 *
 * Las filas de UN renglón del resultado o de la caja —las mismas que suman su
 * monto— con su fecha, quién, qué y el enlace a su origen: `RespuestaDetalle`
 * `{ mes, fuente, filas, total }`. `total` es el número del renglón.
 */

const Query = z.object({
  mes: z.string().refine(esMesDelNegocio, "mes debe ser YYYY-MM, entre 2000 y 2100").optional(),
  fuente: z.enum(FUENTES_DETALLE, { message: `fuente debe ser una de: ${FUENTES_DETALLE.join(", ")}` }),
});

export async function GET(req: NextRequest) {
  // Mismo array que el resultado: el detalle es la misma plata, abierta.
  const auth = await requireAdmin(req, RUTAS_PANEL["/api/finanzas/resultado"]);
  if (auth instanceof NextResponse) return auth;
  // ADR-451 §Roles: sólo admin y dueño — `requireAdmin` deja pasar al encargado por el
  // management-tier, así que se lo corta acá (mismo criterio que Liquidar).
  const noEsDueno = soloAdminODueno(auth.role, "ver el resultado del negocio");
  if (noEsDueno) return noEsDueno;
  // Lo ganado de RRHH sólo para quien lo ve en RRHH (ADR-414 §7).
  const opciones = { verPlanilla: RRHH_COMPLETO.includes(auth.role) };

  const sp = new URL(req.url).searchParams;
  const q = Query.safeParse({ mes: sp.get("mes") || undefined, fuente: sp.get("fuente") || undefined });
  if (!q.success) {
    return NextResponse.json({ error: q.error.issues[0]?.message ?? "Parámetros inválidos" }, { status: 400 });
  }

  const { hoy, mes: mesDeHoy } = hoyDeLima();
  try {
    return NextResponse.json(await ResultadoNegocioDB.detalle(auth.tenantId, q.data.mes ?? mesDeHoy, q.data.fuente, hoy, opciones));
  } catch (err) {
    logger.error("[finanzas/resultado/detalle] failed", { error: String(err), tenantId: auth.tenantId, fuente: q.data.fuente });
    return NextResponse.json({ error: "No se pudo abrir el detalle" }, { status: 500 });
  }
}
