import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";
import { ProveedorFichaDB } from "@/lib/db/proveedor-ficha.db";
import { periodoValido } from "@/lib/compras/evaluacion-proveedor";

/**
 * GET /api/proveedores/:id/scorecard?meses=3|6|12 — cómo te entrega un
 * proveedor, con período, muestra y fórmula (C36, 17-10). La cuenta vive en
 * `lib/compras/evaluacion-proveedor.ts`. Antes: «a tiempo» = editada dentro de
 * 7 días, anuladas en la muestra y 100 % de puntualidad sin ninguna entrega.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const meses = periodoValido(req.nextUrl.searchParams.get("meses") ?? 12);
  try {
    const evaluacion = await ProveedorFichaDB.evaluacion(auth.tenantId, id, meses);
    if (!evaluacion) return NextResponse.json({ error: "No encontramos ese proveedor." }, { status: 404 });
    return NextResponse.json(evaluacion);
  } catch (e) {
    logger.error("[proveedores/scorecard] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "No se pudo calcular la evaluación." }, { status: 503 });
  }
}
