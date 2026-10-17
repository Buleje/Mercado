import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";
import { logActivity } from "@/lib/activity-logger";
import { ComprasMercadoDB } from "@/lib/db/compras-mercado.db";
import { DatosMercadoSchema } from "@/lib/compras/mercado";

/**
 * Precios del mercado compartidos con el equipo (C38). Una lista por negocio:
 * GET la trae con su versión; PUT la reemplaza entera si nadie guardó desde
 * esa versión (si no, 409 con lo último para recargar sin pisar a nadie).
 * Son referencias de la competencia: no tocan precios ni costos del sistema.
 */

const ROLES = ["admin", "almacenero"] as const;

const PutSchema = z.object({
  datos: DatosMercadoSchema,
  version: z.number().int().nonnegative(),
});

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ROLES);
  if (auth instanceof NextResponse) return auth;
  try {
    return NextResponse.json(await ComprasMercadoDB.leer(auth.tenantId));
  } catch (e) {
    logger.error("[compras/mercado] GET error", { error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "No se pudo traer los precios del mercado." }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin(req, ROLES);
  if (auth instanceof NextResponse) return auth;

  const parsed = PutSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "La lista no tiene el formato esperado.", issues: parsed.error.issues.slice(0, 5) }, { status: 400 });
  }

  const usuario = auth.username || "admin";
  try {
    const r = await ComprasMercadoDB.guardar(auth.tenantId, parsed.data.datos, parsed.data.version, usuario);
    if (!r.ok) {
      return NextResponse.json(
        { error: "Alguien de tu equipo guardó cambios antes. Te traemos lo último.", conflicto: r.conflicto },
        { status: 409 },
      );
    }
    logActivity(
      "update",
      "precios-mercado",
      `Precios del mercado: ${r.doc.datos.products.length} productos, ${r.doc.datos.competitors.length} competidores (versión ${r.doc.version})`,
      undefined,
      usuario,
      undefined,
      auth.tenantId,
    ).catch((err: unknown) => logger.warn("[compras/mercado] logActivity failed", { error: String(err) }));
    return NextResponse.json(r.doc);
  } catch (e) {
    logger.error("[compras/mercado] PUT error", { error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "No se pudo guardar los precios del mercado." }, { status: 500 });
  }
}
