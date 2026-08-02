import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { ForestCtpFichaDB } from "@/lib/db/forest-ctp-ficha.db";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";

/**
 * /api/admin/forestal/ctp-ficha — Ficha legal del CTP (identidad SERFOR/ARFFS).
 * GET (lee) · PUT (guarda, roles admin/owner).
 * Guard: spec:forestal:ctp-libro · rate-limit GENEROUS bucket 'ctp'.
 * Sin migración: persiste en el KV `PlatformSetting` (ver ForestCtpFichaDB).
 */

const tituloSchema = z.object({
  tipo: z.string().trim().max(40),
  codigo: z.string().trim().max(80),
  // Casilleros (8) y (9) de la GTF. `default("")` y no `.optional()` a secas:
  // los títulos ya guardados no los traen y tienen que seguir validando.
  resolucion: z.string().trim().max(160).optional().default(""),
  planManejo: z.string().trim().max(80).optional().default(""),
  vencimiento: z.string().trim().max(10).optional().default(""),
});

const citesPermisoSchema = z.object({
  especie: z.string().trim().max(120),
  numero: z.string().trim().max(80),
  vencimiento: z.string().trim().max(10),
});

const fichaSchema = z.object({
  nombreCtp: z.string().trim().max(160).optional(),
  codigoCtp: z.string().trim().max(60).optional(),
  // RUC peruano = 11 dígitos. Se permite vacío durante la carga inicial, pero si
  // viene algo debe ser 11 dígitos — un RUC inventado en un documento es peor que ninguno.
  ruc: z.string().trim().regex(/^\d{11}$/, "El RUC debe tener 11 dígitos").or(z.literal("")).optional(),
  razonSocial: z.string().trim().max(200).optional(),
  arffs: z.string().trim().max(160).optional(),
  registroArffs: z.string().trim().max(120).optional(),
  registroArffsFecha: z.string().trim().max(10).optional(),
  titulos: z.array(tituloSchema).max(50).optional(),
  citesPermisos: z.array(citesPermisoSchema).max(50).optional(),
  representante: z.string().trim().max(160).optional(),
  representanteDni: z.string().trim().max(20).optional(),
  direccion: z.string().trim().max(240).optional(),
  region: z.string().trim().max(80).optional(),
  provincia: z.string().trim().max(80).optional(),
  distrito: z.string().trim().max(80).optional(),
  ubigeo: z.string().trim().max(10).optional(),
  telefono: z.string().trim().max(40).optional(),
  email: z.string().trim().max(160).optional(),
  gtfSerie: z.string().trim().max(20).optional(),
});

async function ensureSpec(tenantId: string) {
  const ok = await isSpecializationEnabled(tenantId, "spec:forestal:ctp-libro");
  return ok
    ? null
    : NextResponse.json(
        { error: "specialization_disabled", message: "El módulo CTP no está habilitado para este tenant." },
        { status: 403 },
      );
}

export const GET = withApiHandler("forestal-ctp-ficha-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;
  try {
    return NextResponse.json({ ficha: await ForestCtpFichaDB.get(auth.tenantId) });
  } catch (err) {
    logger.error("[ctp-ficha.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const PUT = withApiHandler("forestal-ctp-ficha-put", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = fichaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
      { status: 422 },
    );
  }
  try {
    const ficha = await ForestCtpFichaDB.set(auth.tenantId, parsed.data, auth.username ?? "unknown");
    return NextResponse.json({ ficha });
  } catch (err) {
    logger.error("[ctp-ficha.PUT] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
