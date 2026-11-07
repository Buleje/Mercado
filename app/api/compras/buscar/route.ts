import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { withDbRetry } from "@/lib/db-retry";
import { logger } from "@/lib/logger";
import { limaDateKey } from "@/lib/utils";
import { buscarEnCompras, type ModoBusqueda } from "@/lib/compras/buscar-compras";
import { datosParaBuscar, ROLES_QUE_VEN_LA_PLATA } from "@/lib/compras/datos-de-compras";

/**
 * GET /api/compras/buscar?q=&modo=todo|recibir — «Buscar en Compras» (C57).
 *
 * Un solo buscador para órdenes, proveedores, cuentas por pagar, recepciones y
 * devoluciones: busca por número de comprobante, código de la orden, RUC,
 * importe o nombre, y cada resultado trae lo vinculado y su siguiente paso.
 * `modo=recibir` (C63, atajo R): sólo las órdenes que esperan mercadería.
 *
 * Las cuentas por pagar viajan sólo a quien gestiona la plata (admin, dueño,
 * encargado); el almacenero busca lo demás.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 80);
  const modo: ModoBusqueda = req.nextUrl.searchParams.get("modo") === "recibir" ? "recibir" : "todo";
  const verPlata = ROLES_QUE_VEN_LA_PLATA.includes(auth.role);
  try {
    const datos = await withDbRetry(() => datosParaBuscar(auth.tenantId, verPlata));
    const resultado = buscarEnCompras(datos, q, { hoy: limaDateKey(), modo });
    return NextResponse.json({ ...resultado, plataOculta: !verPlata });
  } catch (e) {
    logger.error("[compras/buscar] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "No pudimos buscar en Compras. Prueba de nuevo." }, { status: 503 });
  }
}
