import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { ForestPlantaZonaDB, ZonaCroquisInvalidaError } from "@/lib/db/forest-planta-zona.db";
import { ForestPlantaAsignacionDB, MAX_ASIGNACIONES_POR_LOTE, ZonaInexistenteError } from "@/lib/db/forest-planta-asignacion.db";
import { ForestPlantaDB } from "@/lib/db/forest-planta.db";
import { isZonaTipo } from "@/lib/forestal/planta-zona-types";
import { withApiHandler } from "@/lib/api-handler";

/**
 * /api/admin/forestal/ctp/planta — zonas físicas del aserradero (Mapa de Planta, ADR-142).
 *
 * GET [?plano=croquis|satelite]
 *                     → { zonas, items, asignaciones, ubicaciones, croquis, huerfanasQuitadas }
 *                       (las zonas traen su `plano`; `croquis` = PlantaCroquis | null, ADR-465)
 * PUT { asignaciones: AsignacionPlanta[] } → ubica varias en UNA escritura (ADR-465)
 * PUT { entryId, zonaId, lat?, lng? }      → forma vieja, una sola (sigue andando)
 * POST { ...zona }    → crea una zona (sin id) y devuelve la creada
 * PATCH { id, ...zona}→ actualiza una zona existente
 * DELETE ?id=<id>     → borra la zona
 *
 * Guard: spec:forestal:ctp-libro · rate-limit GENEROUS bucket 'ctp'. Zonas en KV
 * (sin migración). Zod safeParse; tipo inválido → 400. Zona del croquis
 * (`plano: "croquis"`): polígono `[[y,x]]` en metros; el área (plana) y el
 * centroide los calcula el servidor.
 */

const zonaSchema = z.object({
  id: z.string().trim().min(1).optional(),
  codigo: z.string().trim().min(1, "El código es obligatorio").max(40),
  nombre: z.string().trim().max(120).nullable().optional(),
  tipo: z.string().trim().refine(isZonaTipo, "Tipo de zona inválido"),
  poligono: z.string().trim().max(50000).nullable().optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  areaM2: z.number().min(0).max(1_000_000_000).nullable().optional(),
  notas: z.string().trim().max(2000).nullable().optional(),
  /** En qué plano está dibujada (ADR-465). Sin el campo = satélite. */
  plano: z.enum(["satelite", "croquis"]).optional(),
});

async function guard(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  if (!(await isSpecializationEnabled(auth.tenantId, "spec:forestal:ctp-libro"))) {
    return NextResponse.json({ error: "specialization_disabled", message: "El módulo CTP no está habilitado." }, { status: 403 });
  }
  return auth;
}

const planoSchema = z.enum(["satelite", "croquis"]).optional();

export const GET = withApiHandler("forestal-ctp-planta", async (req: NextRequest) => {
  const auth = await guard(req);
  if (auth instanceof NextResponse) return auth;
  /* `plano` se valida pero no recorta: las zonas traen su `plano` y la
     pantalla elige; una ubicación es una sola aunque haya dos planos. */
  const plano = planoSchema.safeParse(req.nextUrl.searchParams.get("plano") ?? undefined);
  if (!plano.success) return NextResponse.json({ error: "invalid_plano", message: "plano = croquis | satelite" }, { status: 400 });
  const vista = await ForestPlantaDB.vista(auth.tenantId, { user: auth.username ?? "sistema" });
  return NextResponse.json(vista);
});

/* lat/lng: en el satélite son grados; en el croquis, y/x en metros (el tope
   del croquis, 90 × 180 m, cabe en los mismos rangos a propósito). */
const asignarSchema = z.object({
  entryId: z.string().trim().min(1).max(120),
  zonaId: z.string().trim().min(1).max(120).nullable(),
  /** Punto exacto dentro de la zona (el operador arrastró el icono). */
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
});

const asignacionSchema = z.object({
  /** `woodEntryId` de la pila, id de corrida/despacho o `troza:<id>`. */
  clave: z.string().trim().min(1).max(120),
  zonaId: z.string().trim().min(1).max(120).nullable(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
});
const loteSchema = z.object({
  asignaciones: z.array(asignacionSchema).min(1).max(MAX_ASIGNACIONES_POR_LOTE),
});

export const PUT = withApiHandler("forestal-ctp-planta-asignar", async (req: NextRequest) => {
  const auth = await guard(req);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }

  // Forma nueva (lote) o vieja (una sola): las dos terminan en `setMany`.
  const lote = loteSchema.safeParse(body);
  let asignaciones: z.infer<typeof asignacionSchema>[];
  if (lote.success) {
    asignaciones = lote.data.asignaciones;
  } else {
    const una = asignarSchema.safeParse(body);
    if (!una.success) {
      const pareceLote = !!body && typeof body === "object" && "asignaciones" in body;
      return NextResponse.json({ error: "invalid_body", issues: (pareceLote ? lote.error : una.error).issues }, { status: 400 });
    }
    asignaciones = [{ clave: una.data.entryId, zonaId: una.data.zonaId, lat: una.data.lat, lng: una.data.lng }];
  }
  // Media coordenada no ubica nada: o van las dos, o el mapa reparte solo.
  const limpias = asignaciones.map((a) =>
    typeof a.lat === "number" && typeof a.lng === "number" ? a : { clave: a.clave, zonaId: a.zonaId },
  );
  try {
    const ubicaciones = await ForestPlantaAsignacionDB.setMany(auth.tenantId, limpias, auth.username ?? "unknown");
    return NextResponse.json({ ok: true, aplicadas: Object.keys(ubicaciones).length, ubicaciones });
  } catch (err) {
    if (err instanceof ZonaInexistenteError) {
      return NextResponse.json({ error: "zona_inexistente", message: "Esa zona ya no existe: recarga el plano.", zonaId: err.zonaId }, { status: 400 });
    }
    throw err;
  }
});

async function upsert(req: NextRequest) {
  const auth = await guard(req);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const parsed = zonaSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });

  try {
    const zona = await ForestPlantaZonaDB.save(auth.tenantId, parsed.data, auth.username ?? "unknown");
    return NextResponse.json({ ok: true, zona });
  } catch (err) {
    if (err instanceof ZonaCroquisInvalidaError) {
      return NextResponse.json({ error: "zona_croquis_invalida", message: err.message }, { status: 400 });
    }
    throw err;
  }
}

export const POST = withApiHandler("forestal-ctp-planta-create", upsert);
export const PATCH = withApiHandler("forestal-ctp-planta-update", upsert);

export const DELETE = withApiHandler("forestal-ctp-planta-delete", async (req: NextRequest) => {
  const auth = await guard(req);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id_required" }, { status: 400 });
  const ok = await ForestPlantaZonaDB.remove(auth.tenantId, id, auth.username ?? "unknown");
  // Las trozas ubicadas en la zona borrada quedan "sin ubicar" (no huérfanas).
  if (ok) await ForestPlantaAsignacionDB.clearForZona(auth.tenantId, id, auth.username ?? "unknown");
  return NextResponse.json({ ok });
});
