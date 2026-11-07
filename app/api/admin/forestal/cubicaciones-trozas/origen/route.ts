import { NextRequest, NextResponse } from "next/server";
import { CubicacionComercialDB } from "@/lib/db/forest-cubicacion-comercial.db";
import { ROLES_CUBICAR, guardCubicacion, libroDelOrigen, noStore, responderError } from "../_comun";

/**
 * GET /api/admin/forestal/cubicaciones-trozas/origen?tipo=loth|despacho&id= (ADR-483)
 *
 * El prellenado de la cubicación comercial: `loth` = una GTF del Libro TH
 * (trozas con 2 Ø de la guía en pulgadas y pies, la cifra SERFOR y las
 * cubicaciones que ya tiene); `despacho` = una línea de Despacho del Libro CTP
 * (lo que dice el libro, las cubicaciones guardadas del Cubicador de madera y
 * el valor de venta del libro).
 *
 * → `{ prefill }` · 404 `ORIGEN_NO_ENCONTRADO` (de otro negocio, borrado o
 * anulado) · 422 `GUIA_ANULADA` · 403 si el libro no está habilitado.
 * Roles: almacenero, admin y dueño (además de las Herramientas Forestales, el
 * libro de donde sale: `loth-libro` o `ctp-libro`).
 */

export async function GET(req: NextRequest) {
  const g = await guardCubicacion(req, { roles: ROLES_CUBICAR, escritura: false });
  if (g instanceof Response) return g;
  const sp = req.nextUrl.searchParams;
  const tipo = sp.get("tipo")?.trim();
  const id = sp.get("id")?.trim().slice(0, 60);
  if ((tipo !== "loth" && tipo !== "despacho") || !id) {
    return NextResponse.json(
      { error: "validation_error", message: "Pide el origen con tipo=loth o tipo=despacho y su id." },
      { status: 422, headers: noStore },
    );
  }
  const sinLibro = await libroDelOrigen(g.auth.tenantId, tipo);
  if (sinLibro) return sinLibro;
  try {
    const prefill =
      tipo === "loth"
        ? await CubicacionComercialDB.prefillLoth(g.auth.tenantId, id)
        : await CubicacionComercialDB.prefillDespacho(g.auth.tenantId, id);
    return NextResponse.json({ prefill }, { headers: noStore });
  } catch (e) {
    return responderError(e, `GET origen ${tipo}`, g.auth.tenantId);
  }
}
