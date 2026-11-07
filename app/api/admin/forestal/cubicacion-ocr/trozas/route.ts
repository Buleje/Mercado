import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { applyRateLimit } from "@/lib/rate-limit";
import { requireAdmin } from "@/lib/require-admin";
import { aiCostGuard } from "@/lib/ai/cost-control";
import { FORMATOS_IMAGEN, gastoDeLectura, visionExtractJSON } from "@/lib/ai/vision-extract";
import { veDetalleDeClaveIA } from "@/lib/ai/detalle-clave-ia";
import { isSpecializationEnabled } from "@/lib/specializations";
import { ForestPlanillasDB } from "@/lib/db/forest-planillas.db";
import { PROMPT_GENERICO_TROZAS, planillaPorId } from "@/lib/forestal/planillas/catalogo";

/**
 * /api/admin/forestal/cubicacion-ocr/trozas — lee una foto de una planilla de
 * cubicación de trozas (rolliza, Ø menor/Ø mayor/largo) llenada a mano en
 * patio y devuelve las filas SIN cubicar todavía. El Smalian se recalcula
 * client-side (`interpretarOcrTrozas` en cubicacion-trozas-import.ts) igual
 * que en el import de Excel — nunca se confía en un m³ que "diga" la foto.
 *
 * NO escribe nada: el operador revisa el preview y confirma antes de que
 * las trozas entren al patio (mismo modal que el import de Excel).
 *
 * Unidades de la respuesta: d1/d2 en cm y largo en m, SALVO con
 * `planillaId: "rolliza-oxapampa"` (lote Oxapampina): ahí d1/d2 son las dos
 * puntas en PULGADAS y el largo en PIES, como se anotan para el pago. Los
 * prompts viven en `lib/forestal/planillas/catalogo.ts`.
 */

const MAX_IMAGE_B64_BYTES = 10_000_000;
const OCR_COST_USD = 0.015;

const RequestSchema = z.object({
  image: z.string().min(100, "Imagen requerida").max(MAX_IMAGE_B64_BYTES, "Imagen muy grande (>10MB)"),
  /* La planilla de campo impresa (17-10): con ella se lee con SU prompt —el
     del catálogo o el que guardó el negocio—, que conoce sus columnas y
     unidades. Sin ella, el prompt genérico del cuaderno de siempre. La forma
     de la respuesta es la misma en los dos casos. */
  planillaId: z.enum(["rolliza-smalian", "rolliza-oxapampa"]).optional(),
});

const TrozaOcrSchema = z.object({
  d1: z.coerce.number().min(0).default(0),
  d2: z.coerce.number().min(0).default(0),
  largo: z.coerce.number().min(0).default(0),
  especie: z.string().default(""),
  incierto: z.boolean().default(false),
});

const ResponseSchema = z.object({
  trozas: z.array(TrozaOcrSchema).max(150),
  advertencia: z.string().default(""),
});

const JSON_SCHEMA = {
  type: "object",
  properties: {
    trozas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          d1: { type: "number" },
          d2: { type: "number" },
          largo: { type: "number" },
          especie: { type: "string" },
          incierto: { type: "boolean" },
        },
        required: ["d1", "d2", "largo", "especie", "incierto"],
        additionalProperties: false,
      },
    },
    advertencia: { type: "string" },
  },
  required: ["trozas", "advertencia"],
  additionalProperties: false,
};

async function ensureSpec(tenantId: string) {
  const ok = await isSpecializationEnabled(tenantId, "spec:forestal:herramientas");
  return ok ? null : NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
}

export async function POST(req: NextRequest) {
  const rl = await applyRateLimit(req, "STRICT", "cubicacion-ocr-trozas");
  if (rl) return rl;
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  const canSpend = await aiCostGuard.canSpend(auth.tenantId, OCR_COST_USD);
  if (!canSpend) {
    return NextResponse.json({ error: "budget_exceeded", message: "Presupuesto de IA agotado este mes." }, { status: 429 });
  }

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const parsedReq = RequestSchema.safeParse(body);
  if (!parsedReq.success) return NextResponse.json({ error: parsedReq.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });

  const planilla = parsedReq.data.planillaId ? planillaPorId(parsedReq.data.planillaId) : null;
  const prompt = planilla ? (await ForestPlanillasDB.promptParaLeer(auth.tenantId, planilla)).texto : PROMPT_GENERICO_TROZAS;

  const result = await visionExtractJSON({
    imageBase64: parsedReq.data.image,
    /* El tipo real (por los bytes) tiene que ser una foto y coincidir con el
       declarado: se rechaza con 400 antes de llamar a la IA (auditoría 2026-10-02). */
    formatos: FORMATOS_IMAGEN,
    verDetalleDeClave: await veDetalleDeClaveIA(req),
    prompt,
    schema: ResponseSchema,
    jsonSchema: JSON_SCHEMA,
    maxTokens: 4000,
    logTag: "[cubicacion-ocr:trozas]",
  });

  /* Lo cobrado se anota en los DOS caminos: una respuesta cortada o ilegible
     también se pagó (auditoría 2026-10-02). Lo que costó DE VERDAD; sin
     `usage`, el fijo. */
  const gasto = gastoDeLectura(result, OCR_COST_USD);
  if (gasto != null) await aiCostGuard.recordSpend(auth.tenantId, gasto);
  if (!result.ok) {
    return NextResponse.json({ error: result.error, raw: result.raw }, { status: result.status });
  }
  return NextResponse.json(result.data);
}
