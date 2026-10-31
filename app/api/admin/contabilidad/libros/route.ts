import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { logAudit } from "@/lib/audit-logger";
import { LibrosContadorDB } from "@/lib/db/libros-contador.db";
import { libroATxt, nombreArchivoLibro, rangoDelPeriodo, type LibroContador, type LibroId, type RangoPeriodo } from "@/lib/contabilidad/libros/comun";
import { armarRegistroVentas } from "@/lib/contabilidad/libros/registro-ventas";
import { armarRegistroCompras } from "@/lib/contabilidad/libros/registro-compras";
import { armarKardexValorizado } from "@/lib/contabilidad/libros/kardex-valorizado";
import { libroAXlsx } from "@/lib/contabilidad/libros/excel";

/**
 * GET /api/admin/contabilidad/libros?libro=ventas|compras|kardex&periodo=YYYY-MM&formato=json|xlsx|txt
 *
 * Libros de trabajo para el contador (formatos SUNAT 14.1, 8.1 y 13.1). Solo lee.
 * `json` (por defecto) = vista previa: columnas, las primeras filas, totales y notas.
 * `xlsx` / `txt` = el archivo entero. El tenant sale de la sesión, nunca de la URL.
 *
 * Roles: los mismos que bajan las ventas y los gastos (`/api/sales/export`, `/api/expenses`):
 * admin y dueño (el encargado entra por el bypass de gestión de `requireAdmin`).
 */

const Consulta = z.object({
  libro: z.enum(["ventas", "compras", "kardex"]),
  periodo: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "periodo debe ser AAAA-MM"),
  formato: z.enum(["json", "xlsx", "txt"]).default("json"),
});

/** Filas que viajan en la vista previa (el archivo lleva todas). */
const FILAS_VISTA_PREVIA = 50;

const ENTIDAD_AUDITORIA = { ventas: "Sale", compras: "Purchase", kardex: "Inventory" } as const;

async function armar(tenantId: string, libro: LibroId, rango: RangoPeriodo): Promise<LibroContador> {
  if (libro === "ventas") return armarRegistroVentas(await LibrosContadorDB.ventas(tenantId, rango));
  if (libro === "compras") return armarRegistroCompras(await LibrosContadorDB.compras(tenantId, rango));
  return armarKardexValorizado(await LibrosContadorDB.kardex(tenantId, rango));
}

export async function GET(req: NextRequest) {
  const limitado = applyRateLimit(req, "MODERATE", "libros-contador");
  if (limitado) return limitado;

  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;

  const parsed = Consulta.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Consulta inválida", detalle: parsed.error.issues.map((i) => i.message) }, { status: 400 });
  }
  const { libro, periodo, formato } = parsed.data;
  const rango = rangoDelPeriodo(periodo);
  if (!rango) return NextResponse.json({ error: "periodo debe ser AAAA-MM" }, { status: 400 });

  try {
    const datos = await armar(auth.tenantId, libro, rango);

    if (formato === "json") {
      return NextResponse.json(
        { ...datos, filas: datos.filas.slice(0, FILAS_VISTA_PREVIA), totalFilas: datos.filas.length },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    logAudit({
      req,
      action: "EXPORT",
      entity: ENTIDAD_AUDITORIA[libro],
      detail: `Libro ${datos.formato} (${libro}) ${periodo} en ${formato}: ${datos.filas.length} filas`,
      user: auth.username,
      tenantId: auth.tenantId,
    });

    if (formato === "txt") {
      return new NextResponse(libroATxt(datos), {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": `attachment; filename="${nombreArchivoLibro(libro, periodo, "txt")}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const cabecera = await LibrosContadorDB.cabecera(auth.tenantId);
    const xlsx = await libroAXlsx(datos, cabecera);
    return new NextResponse(new Uint8Array(xlsx), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${nombreArchivoLibro(libro, periodo, "xlsx")}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    logger.error("[api/admin/contabilidad/libros] GET falló", { tenantId: auth.tenantId, libro, periodo, error: String(err) });
    return NextResponse.json({ error: "No pude armar el libro" }, { status: 500 });
  }
}
