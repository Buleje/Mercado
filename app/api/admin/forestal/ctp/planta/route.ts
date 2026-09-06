import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { ForestPlantaZonaDB } from "@/lib/db/forest-planta-zona.db";
import { ForestPlantaAsignacionDB } from "@/lib/db/forest-planta-asignacion.db";
import { ForestCtpDB } from "@/lib/db/forest-ctp.db";
import { isZonaTipo } from "@/lib/forestal/planta-zona-types";
import { soloZonas } from "@/lib/forestal/planta-ubicacion";
import { withApiHandler } from "@/lib/api-handler";

/**
 * /api/admin/forestal/ctp/planta — zonas físicas del aserradero (Mapa de Planta, ADR-142).
 *
 * GET                 → { zonas }
 * POST { ...zona }    → crea una zona (sin id) y devuelve la creada
 * PATCH { id, ...zona}→ actualiza una zona existente
 * DELETE ?id=<id>     → borra la zona
 *
 * Guard: spec:forestal:ctp-libro · rate-limit GENEROUS bucket 'ctp'. Zonas en KV
 * (sin migración). Zod safeParse; tipo inválido → 400.
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
});

async function guard(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  if (!(await isSpecializationEnabled(auth.tenantId, "spec:forestal:ctp-libro"))) {
    return NextResponse.json({ error: "specialization_disabled", message: "El módulo CTP no está habilitado." }, { status: 403 });
  }
  return auth;
}

export const GET = withApiHandler("forestal-ctp-planta", async (req: NextRequest) => {
  const auth = await guard(req);
  if (auth instanceof NextResponse) return auth;
  const [zonas, trozasSrc, prodSrc, despRes, asignaciones] = await Promise.all([
    ForestPlantaZonaDB.list(auth.tenantId),
    ForestCtpDB.availableSource(auth.tenantId, "produccion"), // trozas (materia prima con saldo)
    ForestCtpDB.availableSource(auth.tenantId, "despacho"), // producto terminado (corridas con stock)
    ForestCtpDB.list(auth.tenantId, { section: "despacho" }), // despachos (salidas)
    ForestPlantaAsignacionDB.getUbicaciones(auth.tenantId),
  ]);
  // Items ubicables del flujo físico: troza (m³) → producto (unidad) → despacho (salida).
  const items = [
    ...trozasSrc.map((t) => ({ id: t.id, kind: "troza" as const, label: `GTF ${t.code ?? "—"}`, sub: t.species ?? null, especie: t.species ?? null, cantidad: t.disponible, unidad: "m³", cites: !!t.cites })),
    ...prodSrc.map((c) => {
      // availableSource devuelve una unión; en la rama "despacho" son corridas.
      const d = c as { id: string; code: string; disponible: number; cites: boolean; species: string | null; productType?: string | null; unit?: string | null };
      // `sub` es lo que se muestra (el producto); `especie` es lo que agrupa el
      // desglose del patio — un mismo producto sale de especies distintas.
      return { id: d.id, kind: "producto" as const, label: d.code ?? "Corrida", sub: d.productType ?? d.species ?? null, especie: d.species ?? null, cantidad: d.disponible, unidad: d.unit ?? "u", cites: !!d.cites };
    }),
    ...despRes.entries.map((d) => ({ id: d.id, kind: "despacho" as const, label: `Despacho #${d.lineNo}`, sub: d.destino ?? d.productType ?? null, especie: d.speciesCommon ?? null, cantidad: Number(d.quantity ?? 0), unidad: d.unit ?? "u", cites: !!d.cites })),
  ];
  /**
   * Se descartan las ubicaciones HUÉRFANAS: la de una línea que ya no está
   * disponible. Al despachar una corrida, su ubicación queda apuntando a una
   * cancha para algo que ya se fue en el camión — no se ve en el mapa (que
   * dibuja sobre `items`) pero sí inflaba el «X de Y ubicados» y hacía crecer
   * el KV un registro por despacho, para siempre.
   */
  const vivos = new Set(items.map((i) => i.id));
  const ubicaciones = Object.fromEntries(Object.entries(asignaciones).filter(([id]) => vivos.has(id)));
  // `asignaciones` (entryId → zonaId) se mantiene por compatibilidad con lo que
  // ya lo consume; `ubicaciones` agrega el punto dentro de la zona.
  return NextResponse.json({ zonas, items, asignaciones: soloZonas(ubicaciones), ubicaciones });
});

const asignarSchema = z.object({
  entryId: z.string().trim().min(1),
  zonaId: z.string().trim().min(1).nullable(),
  /** Punto exacto dentro de la zona (el operador arrastró el icono). */
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
});

export const PUT = withApiHandler("forestal-ctp-planta-asignar", async (req: NextRequest) => {
  const auth = await guard(req);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const parsed = asignarSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });

  const { entryId, zonaId, lat, lng } = parsed.data;
  // Media coordenada no ubica nada: o van las dos, o el mapa reparte solo.
  const pos = typeof lat === "number" && typeof lng === "number" ? { lat, lng } : null;
  await ForestPlantaAsignacionDB.set(auth.tenantId, entryId, zonaId, auth.username ?? "unknown", pos);
  return NextResponse.json({ ok: true });
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

  const zona = await ForestPlantaZonaDB.save(auth.tenantId, parsed.data, auth.username ?? "unknown");
  return NextResponse.json({ ok: true, zona });
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
