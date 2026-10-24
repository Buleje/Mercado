import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import type { AdminRole } from "@/lib/session";
import { AQuienFiarleDB } from "@/lib/db/a-quien-fiarle.db";
import { logger } from "@/lib/logger";
import { soloAdminODueno } from "@/lib/forestal/plata-de-guia-rol";

/**
 * GET /api/finanzas/a-quien-fiarle — Mi Plata › Fiarle: cada cliente con
 * Sí / Con cuidado / No y el motivo (`lib/credit/a-quien-fiarle.ts`).
 *
 * Antes la vista lo calculaba en el navegador con `/api/customers` +
 * `/api/fiados` y no unía un solo fiado con su cliente (11-10, medido en
 * `main`). Roles: los de sus hermanas de Mi Plata (`/api/admin/por-cobrar`,
 * `/api/finanzas/por-pagar`): admin y dueño.
 */

const ROLES: readonly AdminRole[] = ["admin", "owner"];

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ROLES);
  if (auth instanceof NextResponse) return auth;
  const noEsDueno = soloAdminODueno(auth.role, "ver a quién fiarle");
  if (noEsDueno) return noEsDueno;

  try {
    return NextResponse.json(await AQuienFiarleDB.listar(auth.tenantId));
  } catch (err) {
    logger.error("[finanzas/a-quien-fiarle] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "No se pudo armar a quién fiarle" }, { status: 500 });
  }
}
