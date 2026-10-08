import { NextRequest, NextResponse } from "next/server";
import { ForestCubicacionTrozasDB } from "@/lib/db/forest-cubicacion-trozas.db";
import { guardarCubicacionSchema } from "@/lib/forestal/cubicacion-cuenta";
import { ROLES_CUBICAR, guardCubicacion, invalido, leerJson, noStore, responderError } from "./_comun";

/**
 * /api/admin/forestal/cubicaciones-trozas (ADR-478)
 * GET  `?beneficiario=&parte=&estado=` → `{ cubicaciones }` (sin las medidas).
 * POST `guardarCubicacionSchema` → 201 `{ cubicacion }` · 404 `PERSONA_NO_ENCONTRADA`
 *      · 422 `MEDIDA_FUERA_DE_RANGO {troza}` · 422 `validation_error`.
 * Guardar: almacenero, admin y dueño. El servidor re-cubica: nunca toma el volumen del cliente.
 */

const ESTADOS = new Set(["borrador", "aplicada", "anulada"]);

export async function GET(req: NextRequest) {
  const g = await guardCubicacion(req, { roles: ROLES_CUBICAR, escritura: false });
  if (g instanceof Response) return g;
  const sp = req.nextUrl.searchParams;
  const estado = sp.get("estado")?.trim() || undefined;
  if (estado && !ESTADOS.has(estado)) {
    return NextResponse.json({ error: "validation_error", message: "El estado es borrador, aplicada o anulada." }, { status: 422 });
  }
  try {
    const cubicaciones = await ForestCubicacionTrozasDB.list(g.auth.tenantId, {
      beneficiarioId: sp.get("beneficiario")?.trim().slice(0, 40) || undefined,
      parteId: sp.get("parte")?.trim().slice(0, 40) || undefined,
      estado: estado as "borrador" | "aplicada" | "anulada" | undefined,
    });
    return NextResponse.json({ cubicaciones }, { headers: noStore });
  } catch (e) {
    return responderError(e, "GET", g.auth.tenantId);
  }
}

export async function POST(req: NextRequest) {
  const g = await guardCubicacion(req, { roles: ROLES_CUBICAR, escritura: true });
  if (g instanceof Response) return g;
  const json = await leerJson(req);
  if (!json.ok) return json.res;
  const parsed = guardarCubicacionSchema.safeParse(json.body);
  if (!parsed.success) return invalido(parsed.error.issues, "Los datos de la cubicación no son válidos.");
  try {
    const cubicacion = await ForestCubicacionTrozasDB.guardar(g.auth.tenantId, parsed.data, g.actor);
    return NextResponse.json({ cubicacion }, { status: 201, headers: noStore });
  } catch (e) {
    return responderError(e, "POST", g.auth.tenantId);
  }
}
