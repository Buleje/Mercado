import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { applyRateLimit } from "@/lib/rate-limit";
import { requireAdmin } from "@/lib/require-admin";
import { aiCostGuard } from "@/lib/ai/cost-control";
import { FORMATOS_IMAGEN, gastoDeLectura, visionExtractJSON } from "@/lib/ai/vision-extract";
import { veDetalleDeClaveIA } from "@/lib/ai/detalle-clave-ia";
import { isSpecializationEnabled } from "@/lib/specializations";
import { ForestPlanillasDB } from "@/lib/db/forest-planillas.db";
import { PROMPT_GENERICO_ASERRADA, planillaPorId } from "@/lib/forestal/planillas/catalogo";

/**
 * /api/admin/forestal/cubicacion-ocr/aserrada — lee una foto de una planilla
 * de cubicación de madera ASERRADA (cantidad × espesor × ancho × largo)
 * llenada a mano y devuelve las filas SIN cubicar todavía. El pie tablar se
 * recalcula client-side (`interpretarOcrPiezas` en cubicacion-import.ts)
 * igual que en el import de Excel — nunca se confía en un total que "diga"
 * la foto.
 *
 * NO escribe nada: el operador revisa el preview y confirma antes de que las
 * piezas entren al lote (mismo modal que el import de Excel).
 *
 * Los prompts viven en `lib/forestal/planillas/catalogo.ts`: el genérico (sin
 * `planillaId`) y el de la planilla impresa «Aserrada · pie tablar».
 */

const MAX_IMAGE_B64_BYTES = 10_000_000;
const OCR_COST_USD = 0.015;

const RequestSchema = z.object({
  image: z.string().min(100, "Imagen requerida").max(MAX_IMAGE_B64_BYTES, "Imagen muy grande (>10MB)"),
  /* La planilla de campo impresa (17-10): con ella se lee con SU prompt —el
     del catálogo o el que guardó el negocio—, que conoce sus columnas y
     unidades. Sin ella, el prompt genérico del cuaderno de siempre. La forma
     de la respuesta es la misma en los dos casos. */
  planillaId: z.enum(["aserrada-pt"]).optional(),
});

const PiezaOcrSchema = z.object({
  cantidad: z.coerce.number().min(0).default(1),
  espesor: z.coerce.number().min(0).default(0),
  ancho: z.coerce.number().min(0).default(0),
  largo: z.coerce.number().min(0).default(0),
  especie: z.string().default(""),
  incierto: z.boolean().default(false),
});

const ResponseSchema = z.object({
  piezas: z.array(PiezaOcrSchema).max(150),
  advertencia: z.string().default(""),
});

const JSON_SCHEMA = {
  type: "object",
  properties: {
    piezas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          cantidad: { type: "number" },
          espesor: { type: "number" },
          ancho: { type: "number" },
          largo: { type: "number" },
          especie: { type: "string" },
          incierto: { type: "boolean" },
        },
        required: ["cantidad", "espesor", "ancho", "largo", "especie", "incierto"],
        additionalProperties: false,
      },
    },
    advertencia: { type: "string" },
  },
  required: ["piezas", "advertencia"],
  additionalProperties: false,
};

async function ensureSpec(tenantId: string) {
  const ok = await isSpecializationEnabled(tenantId, "spec:forestal:herramientas");
  return ok ? null : NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
}

export async function POST(req: NextRequest) {
  const rl = await applyRateLimit(req, "STRICT", "cubicacion-ocr-aserrada");
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
  const prompt = planilla ? (await ForestPlanillasDB.promptParaLeer(auth.tenantId, planilla)).texto : PROMPT_GENERICO_ASERRADA;

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
    logTag: "[cubicacion-ocr:aserrada]",
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
