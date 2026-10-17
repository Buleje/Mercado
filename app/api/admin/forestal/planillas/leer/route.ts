import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { applyRateLimit } from "@/lib/rate-limit";
import { requireAdmin } from "@/lib/require-admin";
import { aiCostGuard } from "@/lib/ai/cost-control";
import { FORMATOS_IMAGEN, costoMaximoLecturaUsd, gastoDeLectura, visionExtractJSON } from "@/lib/ai/vision-extract";
import { veDetalleDeClaveIA } from "@/lib/ai/detalle-clave-ia";
import { isSpecializationEnabled } from "@/lib/specializations";
import { ForestPlanillasDB } from "@/lib/db/forest-planillas.db";
import { PLANILLAS_LECTURA_GENERICA, esPlanillaId, planillaPorId } from "@/lib/forestal/planillas/catalogo";
import { esquemasDeLectura, normalizarLectura } from "@/lib/forestal/planillas/lectura";
import type { LecturaPlanilla, PlanillaId } from "@/lib/forestal/planillas/tipos";

/**
 * POST /api/admin/forestal/planillas/leer { planillaId, imagen } → LecturaPlanilla
 *
 * Lee la foto de una planilla de campo que NO es de cubicar (conteo de patio,
 * parte de producción, censo de árboles) con el prompt del catálogo —o el del
 * negocio— y devuelve las filas por clave de columna, con las dudosas
 * marcadas. NO escribe nada: las filas van a la vista previa del importador de
 * su destino, que valida y cubica como con un Excel.
 *
 * Las de cubicar van por `cubicacion-ocr/aserrada` y `cubicacion-ocr/trozas`
 * con `planillaId`: devuelven la forma que sus cubicadores ya entienden.
 *
 * Límite MODERATE (20 cada 5 min) y no STRICT como las rutas de cubicar: un
 * censo de 200 árboles son 13 hojas, y con 10 cada 15 min la 11.ª moría en 429
 * a mitad de la carga. El gasto lo frena `aiCostGuard` con la reserva del peor caso.
 */

const MAX_IMAGE_B64_BYTES = 10_000_000;
const MAX_TOKENS = 6000;
const RESERVA_USD = costoMaximoLecturaUsd({ maxTokens: MAX_TOKENS });

const RequestSchema = z.object({
  planillaId: z.custom<PlanillaId>(esPlanillaId, { message: "Planilla desconocida" }),
  imagen: z.string().min(100, "Imagen requerida").max(MAX_IMAGE_B64_BYTES, "Imagen muy grande (>10MB)"),
});

async function ensureSpec(tenantId: string) {
  const ok = await isSpecializationEnabled(tenantId, "spec:forestal:herramientas");
  return ok ? null : NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
}

export async function POST(req: NextRequest) {
  const rl = await applyRateLimit(req, "MODERATE", "planillas-leer");
  if (rl) return rl;
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });

  const planilla = planillaPorId(parsed.data.planillaId);
  if (!planilla) return NextResponse.json({ error: "Planilla desconocida" }, { status: 400 });
  if (!PLANILLAS_LECTURA_GENERICA.includes(planilla.id)) {
    return NextResponse.json(
      { error: `«${planilla.nombre}» se lee desde su cubicador (Leer foto), que la cubica al importar.` },
      { status: 400 },
    );
  }

  const canSpend = await aiCostGuard.canSpend(auth.tenantId, RESERVA_USD);
  if (!canSpend) {
    return NextResponse.json({ error: "budget_exceeded", message: "Presupuesto de IA agotado este mes." }, { status: 429 });
  }

  const prompt = await ForestPlanillasDB.promptParaLeer(auth.tenantId, planilla);
  const { schema, jsonSchema } = esquemasDeLectura(planilla);
  const result = await visionExtractJSON({
    imageBase64: parsed.data.imagen,
    formatos: FORMATOS_IMAGEN,
    verDetalleDeClave: await veDetalleDeClaveIA(req),
    prompt: prompt.texto,
    schema,
    jsonSchema,
    maxTokens: MAX_TOKENS,
    logTag: `[planillas:leer:${planilla.id}]`,
  });

  // Lo cobrado se anota también si la respuesta salió cortada o ilegible: se pagó igual.
  const gasto = gastoDeLectura(result, RESERVA_USD);
  if (gasto != null) await aiCostGuard.recordSpend(auth.tenantId, gasto);
  if (!result.ok) {
    return NextResponse.json({ error: result.error, raw: result.raw }, { status: result.status });
  }

  const lectura: LecturaPlanilla = normalizarLectura(planilla, result.data, { origen: prompt.origen, version: prompt.version });
  return NextResponse.json(lectura);
}
