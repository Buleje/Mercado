import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import type { AdminRole } from "@/lib/session";
import { PorPagarDB } from "@/lib/db/por-pagar.db";
import { limaDateKey } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { soloAdminODueno } from "@/lib/forestal/plata-de-guia-rol";

/**
 * GET /api/finanzas/por-pagar — todo lo que el negocio debe (F10 «Lo que debo»).
 *
 * Devuelve `PorPagarDetalle` (`lib/finance/por-pagar.ts`): una fila por
 * acreedor con su desglose por fuente, los totales por moneda y por fuente
 * (derivados de esas mismas filas) y, para quien también te debe, su neto.
 * `?resumen=1` devuelve sólo los totales (para saber si hay algo sin bajar la
 * lista entera).
 *
 * Sólo lectura, del tenant de la SESIÓN. Los roles son los de sus hermanas
 * (`/api/finanzas/resultado`, `/api/finanzas/caja-del-negocio`): es plata del
 * negocio entero — cajero, almacenero y encargado reciben 403 (`requireAdmin` deja
 * pasar al encargado por el management tier: el segundo guard lo corta, igual que
 * en las hermanas; revisión 29-09).
 */

const ROLES: readonly AdminRole[] = ["admin", "owner"];

const Query = z.object({
  resumen: z.enum(["0", "1"], { message: "resumen va 0 o 1" }).optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ROLES);
  if (auth instanceof NextResponse) return auth;
  const noEsDueno = soloAdminODueno(auth.role, "ver lo que debes");
  if (noEsDueno) return noEsDueno;

  const sp = new URL(req.url).searchParams;
  // Un parámetro vacío (`?resumen=`) es «no mandado».
  const q = Query.safeParse({ resumen: sp.get("resumen") || undefined });
  if (!q.success) {
    return NextResponse.json({ error: q.error.issues[0]?.message ?? "Parámetros inválidos" }, { status: 400 });
  }

  try {
    const detalle = await PorPagarDB.getDetalle(auth.tenantId, limaDateKey());
    if (q.data.resumen === "1") {
      const { hoy, totales, porFuente, truncado, personas } = detalle;
      return NextResponse.json({ hoy, totales, porFuente, truncado, cuentas: personas.length });
    }
    return NextResponse.json(detalle);
  } catch (err) {
    logger.error("[finanzas/por-pagar] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "No se pudo armar lo que debes" }, { status: 500 });
  }
}
