import { NextRequest, NextResponse } from "next/server";
import { ForestCubicacionTrozasDB } from "@/lib/db/forest-cubicacion-trozas.db";
import { CubicacionComercialDB } from "@/lib/db/forest-cubicacion-comercial.db";
import { guardarCubicacionSchema } from "@/lib/forestal/cubicacion-cuenta";
import { guardarAserradaSchema, type MaterialCubicacion, type OrigenCubicacion } from "@/lib/forestal/cubicacion-comercial-tipos";
import { ROLES_CUBICAR, esAserrada, guardCubicacion, invalido, leerJson, libroDelOrigen, noStore, responderError } from "./_comun";

/**
 * /api/admin/forestal/cubicaciones-trozas (ADR-478, ADR-483)
 * GET  `?beneficiario=&parte=&estado=&material=troza|aserrada|todas&origen=&origenId=` → `{ cubicaciones }`
 *      (sin las medidas). Sin `material` = sólo trozas.
 * POST `guardarCubicacionSchema` (trozas, con `origen: "loth"` y descuentos) o, con `material: "aserrada"`,
 *      `guardarAserradaSchema` → 201 `{ cubicacion }` · 404 `PERSONA_NO_ENCONTRADA` / `ORIGEN_NO_ENCONTRADO`
 *      / `CUBICACION_REF_NO_ENCONTRADA` · 422 `MEDIDA_FUERA_DE_RANGO {troza}` / `DESCUENTO_INVALIDO`
 *      / `GUIA_ANULADA` / `validation_error`.
 * Guardar: almacenero, admin y dueño. El servidor re-cubica: nunca toma el volumen del cliente.
 */

const ESTADOS = new Set(["borrador", "aplicada", "anulada"]);
const MATERIALES = new Set(["troza", "aserrada", "todas"]);
const ORIGENES = new Set(["libre", "ctp", "loth", "despacho"]);

export async function GET(req: NextRequest) {
  const g = await guardCubicacion(req, { roles: ROLES_CUBICAR, escritura: false });
  if (g instanceof Response) return g;
  const sp = req.nextUrl.searchParams;
  const estado = sp.get("estado")?.trim() || undefined;
  if (estado && !ESTADOS.has(estado)) {
    return NextResponse.json({ error: "validation_error", message: "El estado es borrador, aplicada o anulada." }, { status: 422 });
  }
  const material = sp.get("material")?.trim() || undefined;
  if (material && !MATERIALES.has(material)) {
    return NextResponse.json({ error: "validation_error", message: "El material es troza, aserrada o todas." }, { status: 422 });
  }
  const origen = sp.get("origen")?.trim() || undefined;
  if (origen && !ORIGENES.has(origen)) {
    return NextResponse.json({ error: "validation_error", message: "El origen es libre, ctp, loth o despacho." }, { status: 422 });
  }
  try {
    const cubicaciones = await ForestCubicacionTrozasDB.list(g.auth.tenantId, {
      beneficiarioId: sp.get("beneficiario")?.trim().slice(0, 40) || undefined,
      parteId: sp.get("parte")?.trim().slice(0, 40) || undefined,
      estado: estado as "borrador" | "aplicada" | "anulada" | undefined,
      material: material as MaterialCubicacion | "todas" | undefined,
      origen: origen as OrigenCubicacion | undefined,
      origenId: sp.get("origenId")?.trim().slice(0, 60) || undefined,
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
  try {
    if (esAserrada(json.body)) {
      const parsed = guardarAserradaSchema.safeParse(json.body);
      if (!parsed.success) return invalido(parsed.error.issues, "Los datos de la cubicación no son válidos.");
      const sinLibro = await libroDelOrigen(g.auth.tenantId, parsed.data.origen);
      if (sinLibro) return sinLibro;
      const cubicacion = await CubicacionComercialDB.guardarAserrada(g.auth.tenantId, parsed.data, g.actor);
      return NextResponse.json({ cubicacion }, { status: 201, headers: noStore });
    }
    const parsed = guardarCubicacionSchema.safeParse(json.body);
    if (!parsed.success) return invalido(parsed.error.issues, "Los datos de la cubicación no son válidos.");
    const sinLibroTH = await libroDelOrigen(g.auth.tenantId, parsed.data.origen);
    if (sinLibroTH) return sinLibroTH;
    const cubicacion = await ForestCubicacionTrozasDB.guardar(g.auth.tenantId, parsed.data, g.actor);
    return NextResponse.json({ cubicacion }, { status: 201, headers: noStore });
  } catch (e) {
    return responderError(e, "POST", g.auth.tenantId);
  }
}
