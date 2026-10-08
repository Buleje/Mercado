import { NextRequest, NextResponse } from "next/server";
import { ForestCubicacionTrozasDB } from "@/lib/db/forest-cubicacion-trozas.db";
import { aplicarCubicacionSchema } from "@/lib/forestal/cubicacion-cuenta";
import { ROLES_PLATA, guardCubicacion, invalido, leerJson, noStore, responderError } from "../../_comun";

/**
 * POST /api/admin/forestal/cubicaciones-trozas/[id]/aplicar (ADR-478) — DINERO.
 * Sólo admin y dueño (el bypass de `manager` se corta). El servidor valoriza;
 * `montoVisto` distinto → 409 `MONTO_CAMBIO {monto, porEspecie}`.
 * 200 `{ cubicacion, imputacion }` (con `repetido: true` si es el mismo intento)
 * · 409 `GUIA_YA_VALORIZADA` / `DESACTUALIZADA` / `YA_APLICADA`
 * · 422 `SIN_ADELANTO_ABIERTO` / `EXCEDE_LO_RECIBIDO {debe}` / `FALTA_PRECIO {especie}` / `IDEMPOTENCIA_DISTINTA`.
 */

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardCubicacion(req, { roles: ROLES_PLATA, escritura: true, plata: true });
  if (g instanceof Response) return g;
  const { id } = await params;
  const json = await leerJson(req);
  if (!json.ok) return json.res;
  const parsed = aplicarCubicacionSchema.safeParse(json.body);
  if (!parsed.success) return invalido(parsed.error.issues, "Los precios no son válidos.");
  try {
    const r = await ForestCubicacionTrozasDB.aplicar(g.auth.tenantId, id, parsed.data, g.actor);
    return NextResponse.json(
      { cubicacion: r.cubicacion, imputacion: r.imputacion, ...(r.repetido ? { repetido: true } : {}) },
      { headers: noStore },
    );
  } catch (e) {
    return responderError(e, "aplicar", g.auth.tenantId);
  }
}
