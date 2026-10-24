import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";
import { ProveedorFichaDB } from "@/lib/db/proveedor-ficha.db";

/** Quien puede ver lo que se le debe a un proveedor: lo mismo que `GET /api/payables`. */
const VEN_DEUDA = new Set(["admin", "owner", "manager"]);

/**
 * GET /api/suppliers/:id/ficha — la ficha de consulta del proveedor (C33/C39):
 * sus órdenes con comprobante, recepciones, devoluciones y cuentas por pagar,
 * más el resumen calculado acá (regla 6: totales en el backend).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    const ficha = await ProveedorFichaDB.ficha(auth.tenantId, id);
    if (!ficha) return NextResponse.json({ error: "No encontramos ese proveedor." }, { status: 404 });
    if (VEN_DEUDA.has(auth.role)) return NextResponse.json({ ...ficha, veDeuda: true });
    // El almacenero ve compras y devoluciones, no la deuda (Por pagar es sólo de gestión).
    return NextResponse.json({
      ...ficha,
      cuentas: [],
      resumen: { ...ficha.resumen, saldo: 0, vencido: 0, cuentasAbiertas: 0 },
      veDeuda: false,
    });
  } catch (e) {
    logger.error("[suppliers/id/ficha] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "No se pudo leer la ficha del proveedor." }, { status: 503 });
  }
}
