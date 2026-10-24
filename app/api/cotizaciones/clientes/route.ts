/**
 * GET /api/cotizaciones/clientes?q= — clientes del negocio para elegir en una
 * cotización (F25): por nombre, razón social, documento o celular.
 *
 * Aparte de `/api/customers` porque aquel busca sólo por nombre y celular y
 * no devuelve el documento ni la razón social, que es lo que la cotización
 * necesita para no hacer escribir el RUC de nuevo.
 */
import { NextRequest, NextResponse } from "next/server";
import { CotizacionesDB } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;
  const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 80);
  try {
    const clientes = await CotizacionesDB.buscarClientes(auth.tenantId, q);
    return NextResponse.json({ clientes });
  } catch (e) {
    logger.error("[cotizaciones] buscar clientes", { err: e instanceof Error ? e.message : String(e), tenantId: auth.tenantId });
    return NextResponse.json({ error: "No se pudo buscar clientes" }, { status: 503 });
  }
}
