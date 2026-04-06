export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";

/**
 * Mejora 19: Retorna conteo de documentos pendientes para badges del sidebar.
 * Cotizaciones ENVIADA, GRR BORRADOR, NC BORRADOR.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const badges: Record<string, number> = {};

  try {
    const cotEnviadas = await prisma.cotizacion.count({
      where: { tenantId: auth.tenantId, status: "ENVIADA" },
    });
    if (cotEnviadas > 0) badges["cotizaciones"] = cotEnviadas;
  } catch { /* tabla puede no existir */ }

  try {
    const grrBorrador = await prisma.guiaRemision.count({
      where: { tenantId: auth.tenantId, status: "BORRADOR" },
    });
    if (grrBorrador > 0) badges["guias-remision"] = grrBorrador;
  } catch { /* tabla puede no existir */ }

  try {
    const ncBorrador = await prisma.notaCredito.count({
      where: { tenantId: auth.tenantId, status: "BORRADOR" },
    });
    if (ncBorrador > 0) badges["notas-credito"] = ncBorrador;
  } catch { /* tabla puede no existir */ }

  return NextResponse.json(badges);
}
