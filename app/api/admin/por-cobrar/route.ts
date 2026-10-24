import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import type { AdminRole } from "@/lib/session";
import { PorCobrarDB, cruzarConLoQueDebes } from "@/lib/db/por-cobrar.db";
import { PorPagarDB } from "@/lib/db/por-pagar.db";
import { soloAdminODueno } from "@/lib/forestal/plata-de-guia-rol";
import { limaDateKey } from "@/lib/utils";
import { logger } from "@/lib/logger";

/**
 * GET /api/admin/por-cobrar
 * Todo lo que te deben (Fiados + Préstamos + Adelantos + madera despachada a
 * cuenta). Sólo lectura, del tenant de la SESIÓN.
 *
 * - sin parámetros: los agregados en soles (`getSummary`, el del cron).
 * - `?detalle=1`: una fila por deuda (quién, cuánto, en qué moneda, desde
 *   cuándo, cuándo vence) con el resumen DERIVADO de esas mismas filas, y el
 *   cruce de quien está también en «Lo que debo» (te debe · le debes · neto,
 *   con las cifras de esa lista). Si «Lo que debo» no se puede leer, la lista
 *   sale igual, sin cruces (`crucesDisponibles: false`).
 * - `?resumen=1`: sólo los totales por moneda, de la MISMA función que el
 *   detalle — es la cifra «Te deben» del Resumen de Mi Plata, que así no puede
 *   decir otro número que la sección.
 *
 * Roles (F12, 2026-09-29): es plata del negocio entero, como sus hermanas
 * (`/api/finanzas/por-pagar`, `/api/finanzas/resultado`): sólo admin y dueño.
 * Antes dejaba pasar al almacenero, que no tiene ningún permiso de finanzas en
 * la matriz; y el encargado entra a `requireAdmin` por el management tier, así
 * que el segundo guard (`soloAdminODueno`) es el que lo corta.
 */

const ROLES: readonly AdminRole[] = ["admin", "owner"];

const Query = z.object({
  detalle: z.enum(["0", "1", "true", "false"]).optional(),
  resumen: z.enum(["0", "1"], { message: "resumen va 0 o 1" }).optional(),
});

export async function GET(req: NextRequest): Promise<Response> {
  const auth = await requireAdmin(req, ROLES);
  if (auth instanceof NextResponse) return auth;
  const noEsDueno = soloAdminODueno(auth.role, "ver lo que te deben");
  if (noEsDueno) return noEsDueno;

  const sp = req.nextUrl.searchParams;
  // Un parámetro vacío (`?resumen=`) es «no mandado».
  const parsed = Query.safeParse({ detalle: sp.get("detalle") || undefined, resumen: sp.get("resumen") || undefined });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Parámetros inválidos" }, { status: 400 });
  }
  const conDetalle = parsed.data.detalle === "1" || parsed.data.detalle === "true";

  try {
    if (parsed.data.resumen === "1") {
      const detalle = await PorCobrarDB.getDetalle(auth.tenantId);
      return NextResponse.json({ totales: detalle.totales, cuentas: detalle.items.length });
    }
    if (!conDetalle) return NextResponse.json(await PorCobrarDB.getSummary(auth.tenantId));

    const [detalle, porPagar] = await Promise.all([
      PorCobrarDB.getDetalle(auth.tenantId),
      /* Sin «Lo que debo» la lista de lo que te deben sigue sirviendo: se
         loguea y sale sin cruces, en vez de un 500 para toda la pantalla. */
      PorPagarDB.getDetalle(auth.tenantId, limaDateKey()).catch((err: unknown) => {
        logger.warn("[por-cobrar GET] sin cruce con lo que debes", { error: String(err), tenantId: auth.tenantId });
        return null;
      }),
    ]);
    return NextResponse.json(cruzarConLoQueDebes(detalle, porPagar));
  } catch (e) {
    logger.error("[por-cobrar GET] error", { err: e instanceof Error ? e.message : String(e), tenantId: auth.tenantId });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
