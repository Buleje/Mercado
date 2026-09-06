import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { ForestDistribucionesDB } from "@/lib/db/forest-distribuciones.db";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";

/**
 * /api/admin/forestal/distribuciones — distribuciones de rolliza guardadas
 * (Brandon, 2026-09-01: "una función para guardar esa distribución de
 * bloques, para cuando quiera en otro lado después pueda escoger eso
 * guardado y se ponga todos los datos de los bloques").
 *
 * GET     — lista las guardadas (más reciente primero).
 * POST    — guarda una nueva o actualiza por `id`.
 * DELETE  — borra por `?id=`.
 *
 * Guard: requireAdmin → rate limit → spec:forestal:herramientas. Los totales
 * NUNCA se toman del cliente: la capa de datos los recalcula desde los bloques.
 */

const filtroLargoSchema = z.object({
  largo: z.coerce.number().positive().max(999),
  pct: z.coerce.number().positive().max(100),
});

const bloqueSchema = z.object({
  id: z.string().trim().min(1).max(80),
  etiqueta: z.string().trim().max(120),
  especie: z.string().trim().max(60),
  m3: z.coerce.number().nonnegative().max(999999),
  permiso: z.string().trim().max(120).nullish(),
  origen: z.enum(["trozas", "manual", "lote"]),
  /* Sin `tipo` = bloque de rolliza: es como venía todo lo guardado antes de
     que existiera la aserrada directa, y Zod BORRA en silencio lo que no
     declara — el mismo agujero por el que se perdían los paquetes del
     importador CTP ([[ctp-import-paquetes-nunca-se-guardaban]]). */
  tipo: z.enum(["rolliza", "aserrada"]).nullish(),
  loteId: z.string().trim().max(80).nullish(),
  /* Igual que `tipo`: sin declararlo, Zod lo borra en silencio y al reabrir la
     distribución el buscador volvería a ofrecer paquetes ya cargados. */
  paqueteId: z.string().trim().max(120).nullish(),
  costoM3: z.coerce.number().nonnegative().max(999999).nullish(),
  aprovechablePct: z.coerce.number().nonnegative().max(100).nullish(),
  amparaManualM3: z.coerce.number().nonnegative().max(999999).nullish(),
  piezasManual: z.coerce.number().int().nonnegative().max(999999).nullish(),
  dias: z.coerce.number().int().positive().max(365).nullish(),
  fecha: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  largoFiltro: z.array(filtroLargoSchema).max(20).nullish(),
  /* Qué tipos lleva el bloque. Sin declararlo acá, Zod lo borra y al reabrir
     la distribución los bloques vuelven a llevar de todo — el mismo agujero
     de `tipo` y `paqueteId`. */
  gruposFiltro: z.array(z.string().trim().min(1).max(200)).max(60).nullish(),
  overridesLinea: z
    .record(z.string(), z.object({ piezas: z.coerce.number().nonnegative().nullish(), m3: z.coerce.number().nonnegative().nullish() }))
    .nullish(),
});

const saveSchema = z.object({
  id: z.string().trim().max(80).optional(),
  nombre: z.string().trim().min(1).max(120),
  fecha: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notas: z.string().trim().max(600).nullish(),
  // Un aserradero no carga más de un puñado de bloques por vez; el tope
  // protege el KV (es un JSON) sin estorbar el uso real.
  bloques: z.array(bloqueSchema).min(1).max(200),
});

async function ensureSpec(tenantId: string) {
  const ok = await isSpecializationEnabled(tenantId, "spec:forestal:herramientas");
  return ok
    ? null
    : NextResponse.json(
        { error: "specialization_disabled", message: "Las Herramientas Forestales no están habilitadas para esta tienda." },
        { status: 403 },
      );
}

export const GET = withApiHandler("forestal-distribuciones-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "distribuciones");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;
  try {
    const distribuciones = await ForestDistribucionesDB.list(auth.tenantId);
    return NextResponse.json({ distribuciones });
  } catch (err) {
    logger.error("[distribuciones.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const POST = withApiHandler("forestal-distribuciones-post", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const rl = await applyRateLimit(req, "GENEROUS", "distribuciones");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const parsed = saveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
      { status: 400 },
    );
  }
  try {
    const distribucion = await ForestDistribucionesDB.save(
      auth.tenantId,
      {
        ...parsed.data,
        notas: parsed.data.notas ?? undefined,
        bloques: parsed.data.bloques.map((b) => ({
          ...b,
          tipo: b.tipo ?? undefined,
          permiso: b.permiso ?? undefined,
          loteId: b.loteId ?? undefined,
          paqueteId: b.paqueteId ?? undefined,
          costoM3: b.costoM3 ?? undefined,
          aprovechablePct: b.aprovechablePct ?? undefined,
          amparaManualM3: b.amparaManualM3 ?? undefined,
          piezasManual: b.piezasManual ?? undefined,
          dias: b.dias ?? undefined,
          fecha: b.fecha ?? undefined,
          largoFiltro: b.largoFiltro ?? undefined,
          gruposFiltro: b.gruposFiltro ?? undefined,
          overridesLinea: b.overridesLinea ?? undefined,
        })),
      },
      auth.username ?? "unknown",
    );
    return NextResponse.json({ distribucion }, { status: parsed.data.id ? 200 : 201 });
  } catch (err) {
    logger.error("[distribuciones.POST] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const DELETE = withApiHandler("forestal-distribuciones-delete", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const rl = await applyRateLimit(req, "GENEROUS", "distribuciones");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });
  try {
    const ok = await ForestDistribucionesDB.remove(auth.tenantId, id, auth.username ?? "unknown");
    return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "not_found" }, { status: 404 });
  } catch (err) {
    logger.error("[distribuciones.DELETE] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
