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
 * GET /api/finanzas/resultado?mes=YYYY-MM&meses=6 — lo ganado en el mes (ADR-451).
 *
 * Devuelve `RespuestaResultado` (`lib/finance/resultado-del-negocio.ts`):
 * `{ actual, serie, generadoEn }`. `mes` es el calendario de Lima (sin él, el
 * mes en curso); `meses` (1-12, por defecto 6) es el largo de la tira que
 * termina en `mes`. El total se arma en el servidor: la pantalla sólo lo pinta.
 * Sólo lectura, del tenant de la sesión.
 */

const Query = z.object({
  mes: z.string().refine(esMesDelNegocio, "mes debe ser YYYY-MM, entre 2000 y 2100").optional(),
  meses: z.coerce.number().int("meses debe ser un número entero").min(1, "meses va de 1 a 12").max(12, "meses va de 1 a 12").optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, RUTAS_PANEL["/api/finanzas/resultado"]);
  if (auth instanceof NextResponse) return auth;
  // ADR-451 §Roles: sólo admin y dueño — `requireAdmin` deja pasar al encargado por el
  // management-tier, así que se lo corta acá (mismo criterio que Liquidar).
  const noEsDueno = soloAdminODueno(auth.role, "ver el resultado del negocio");
  if (noEsDueno) return noEsDueno;
  // Lo ganado de RRHH sólo para quien lo ve en RRHH (ADR-414 §7).
  const opciones = { verPlanilla: RRHH_COMPLETO.includes(auth.role) };

  const sp = new URL(req.url).searchParams;
  // Un parámetro vacío (`?meses=`) es «no mandado», no 0.
  const q = Query.safeParse({ mes: sp.get("mes") || undefined, meses: sp.get("meses") || undefined });
  if (!q.success) {
    return NextResponse.json({ error: q.error.issues[0]?.message ?? "Parámetros inválidos" }, { status: 400 });
  }

  const { hoy, mes: mesDeHoy } = hoyDeLima();
  try {
    return NextResponse.json(await ResultadoNegocioDB.resultado(auth.tenantId, q.data.mes ?? mesDeHoy, q.data.meses ?? 6, hoy, opciones));
  } catch (err) {
    logger.error("[finanzas/resultado] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "No se pudo armar el resultado del mes" }, { status: 500 });
  }
}
