import { NextRequest, NextResponse } from "next/server";
import { ForestCubicacionTrozasDB } from "@/lib/db/forest-cubicacion-trozas.db";
import { CubicacionComercialDB } from "@/lib/db/forest-cubicacion-comercial.db";
import { editarCubicacionSchema } from "@/lib/forestal/cubicacion-cuenta";
import { editarAserradaSchema } from "@/lib/forestal/cubicacion-comercial-tipos";
import { permisoAdelantos } from "@/lib/adelantos/permisos";
import { ROLES_CUBICAR, ROLES_PLATA, esAserrada, guardCubicacion, invalido, leerJson, libroDelOrigen, noStore, responderError } from "../_comun";

/**
 * /api/admin/forestal/cubicaciones-trozas/[id] (ADR-478)
 * GET    → `{ cubicacion (con trozas), adelantosAbiertos, ultimosPrecios }` · 404. Sin permiso
 *          de leer Adelantos (el almacenero) sólo `{ cubicacion }`: los saldos de la persona
 *          no salen por acá si `/api/adelantos` se los niega.
 * PATCH  `editarCubicacionSchema` (con `version`), o `editarAserradaSchema` con `material: "aserrada"` (ADR-483)
 *        → `{ cubicacion }` · 409 `DESACTUALIZADA` / `YA_APLICADA` / `ANULADA` / `MATERIAL_DISTINTO` (la fila manda el material).
 * DELETE → 204 (sólo borrador) · 409 `YA_APLICADA`. Borrar: admin y dueño.
 */

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const g = await guardCubicacion(req, { roles: ROLES_CUBICAR, escritura: false });
  if (g instanceof Response) return g;
  const { id } = await params;
  try {
    const detalle = await ForestCubicacionTrozasDB.detalle(g.auth.tenantId, id);
    if (!detalle) return NextResponse.json({ error: "NO_ENCONTRADA", message: "Esa cubicación no existe." }, { status: 404 });
    const veLaPlata = permisoAdelantos(g.auth.role, "read") === null;
    return NextResponse.json(veLaPlata ? detalle : { cubicacion: detalle.cubicacion }, { headers: noStore });
  } catch (e) {
    return responderError(e, "GET id", g.auth.tenantId);
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const g = await guardCubicacion(req, { roles: ROLES_CUBICAR, escritura: true });
  if (g instanceof Response) return g;
  const { id } = await params;
  const json = await leerJson(req);
  if (!json.ok) return json.res;
  try {
    if (esAserrada(json.body)) {
      const parsed = editarAserradaSchema.safeParse(json.body);
      if (!parsed.success) return invalido(parsed.error.issues, "Los datos de la cubicación no son válidos.");
      const sinLibro = await libroDelOrigen(g.auth.tenantId, parsed.data.origen);
      if (sinLibro) return sinLibro;
      const cubicacion = await CubicacionComercialDB.editarAserrada(g.auth.tenantId, id, parsed.data, g.actor);
      return NextResponse.json({ cubicacion }, { headers: noStore });
    }
    const parsed = editarCubicacionSchema.safeParse(json.body);
    if (!parsed.success) return invalido(parsed.error.issues, "Los datos de la cubicación no son válidos.");
    const sinLibroTH = await libroDelOrigen(g.auth.tenantId, parsed.data.origen);
    if (sinLibroTH) return sinLibroTH;
    const cubicacion = await ForestCubicacionTrozasDB.editar(g.auth.tenantId, id, parsed.data, g.actor);
    return NextResponse.json({ cubicacion }, { headers: noStore });
  } catch (e) {
    return responderError(e, "PATCH", g.auth.tenantId);
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const g = await guardCubicacion(req, { roles: ROLES_PLATA, escritura: true, soloAdmin: true });
  if (g instanceof Response) return g;
  const { id } = await params;
  try {
    await ForestCubicacionTrozasDB.borrar(g.auth.tenantId, id, g.actor);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    return responderError(e, "DELETE", g.auth.tenantId);
  }
}
