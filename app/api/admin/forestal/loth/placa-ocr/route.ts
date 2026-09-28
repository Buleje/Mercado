import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimitWithTenant } from "@/lib/rate-limit";
import { aiCostGuard } from "@/lib/ai/cost-control";
import { visionExtractJSON } from "@/lib/ai/vision-extract";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { limpiarCodigoLeido, type LecturaPlaca } from "@/lib/forestal/loth-placa";

/**
 * /api/admin/forestal/loth/placa-ocr — lee el código del árbol en la foto de
 * la placa del tocón (RDE 264-2019, sección 1, ítem 3). Sólo LEE: no elige el
 * árbol ni guarda la foto. El cruce con el censo lo hace la pantalla
 * (`cruzarPlacaConCenso`) y la foto va por `/api/upload`, como la de siempre.
 *
 * Mismo camino que las otras lecturas de fotos (`visionExtractJSON`: OpenAI si
 * hay clave, si no Anthropic). La imagen nunca va al log: sólo el error y el
 * final del tenant.
 */

/* El teléfono la achica a ≤1600 px en JPEG antes de mandarla (~0,5 MB → ~0,7
   MB en base64). 4 MB de base64 ≈ 3 MB de imagen: sobra para una placa y
   corta a tiempo una foto cruda de 12 MP. */
const MAX_IMAGE_B64 = 4_000_000;
/* El cuerpo entero (JSON + comillas): se mira antes de leerlo. */
const MAX_BODY_BYTES = MAX_IMAGE_B64 + 2_000;
const OCR_COST_USD = 0.01;

const RequestSchema = z.object({
  /* Sólo JPEG: el lector se la pasa a Anthropic anunciada como JPEG (una PNG
     anunciada así se rechaza). El teléfono la convierte antes de mandarla. */
  image: z
    .string()
    .min(100, "Falta la foto de la placa.")
    .max(MAX_IMAGE_B64, "La foto es muy grande: tómala de nuevo.")
    .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/, "La foto tiene que llegar en JPEG."),
});

/** Lo que devuelve el modelo. Un `null` o un número en texto no tumba la lectura. */
const LeidoSchema = z.object({
  codigo: z.preprocess((v) => (v == null ? "" : String(v)), z.string()).default(""),
  confianza: z.preprocess((v) => (v == null || v === "" ? 0 : v), z.coerce.number()).default(0),
  nota: z.preprocess((v) => (v == null ? "" : String(v)), z.string()).default(""),
});

const JSON_SCHEMA = {
  type: "object",
  properties: {
    codigo: { type: "string" },
    confianza: { type: "number" },
    nota: { type: "string" },
  },
  required: ["codigo", "confianza", "nota"],
  additionalProperties: false,
};

const PROMPT =
  "Esta foto es de la placa (chapa metálica o plástica, o un código pintado o tallado) que identifica un árbol " +
  "talado en un bosque de Perú; va clavada en el tocón o en el fuste. Lee el CÓDIGO DEL ÁRBOL tal como está escrito, " +
  "con sus letras, guiones y ceros (ej. «114», «0114», «85-TOR», «114-LUP»). No es un número de parcela, de faja " +
  "ni una fecha. No lo completes ni lo adivines: si un carácter no se ve, baja la confianza. " +
  "Devuelve SOLO JSON: codigo (el código leído; vacío si no hay placa o no se lee), confianza (de 0 a 1: qué tan " +
  "seguro estás de CADA carácter), nota (breve, en español, sólo si algo es dudoso: «el último dígito está tapado»; " +
  'si no, vacío). Formato: {"codigo":"","confianza":0,"nota":""}.';

async function ensureSpec(tenantId: string) {
  const ok = await isSpecializationEnabled(tenantId, "spec:forestal:loth-libro");
  return ok ? null : NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  /* Por IP (MODERATE, 20 cada 5 min) y por tienda: un día de tala son 20-40
     árboles, con alguna foto repetida. */
  const rl = applyRateLimitWithTenant(req, "MODERATE", auth.tenantId, "loth-placa-ocr", { maxReqs: 120, windowSec: 60 * 60 });
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  const largo = Number(req.headers.get("content-length") ?? 0);
  if (largo > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "La foto es muy grande: tómala de nuevo." }, { status: 413 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "No llegó la foto." }, { status: 400 });
  }
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  }

  if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    logger.warn("[placa-ocr] sin OPENAI_API_KEY ni ANTHROPIC_API_KEY configuradas", { tenantId: auth.tenantId.slice(-6) });
    return NextResponse.json(
      { error: "La lectura automática de placas todavía no está activada.", codigo: "sin_lector" },
      { status: 503 },
    );
  }

  const canSpend = await aiCostGuard.canSpend(auth.tenantId, OCR_COST_USD);
  if (!canSpend) {
    return NextResponse.json({ error: "Se acabó el presupuesto de lectura con IA de este mes." }, { status: 429 });
  }

  const r = await visionExtractJSON({
    imageBase64: parsed.data.image,
    prompt: PROMPT,
    schema: LeidoSchema,
    jsonSchema: JSON_SCHEMA,
    maxTokens: 200,
    logTag: "[placa-ocr]",
  });
  if (!r.ok) {
    /* El detalle técnico ya quedó en el log del lector; a la persona, qué hacer. */
    const error =
      r.status === 503 ? "La lectura automática de placas todavía no está activada." : "No se pudo leer la foto. Elige el árbol en la lista o escribe el código.";
    return NextResponse.json({ error }, { status: r.status === 422 ? 422 : r.status === 503 ? 503 : 502 });
  }
  await aiCostGuard.recordSpend(auth.tenantId, OCR_COST_USD);

  const codigo = limpiarCodigoLeido(r.data.codigo);
  /* Hay modelos que la dan en porcentaje (93 en vez de 0,93). */
  const bruta = Number.isFinite(r.data.confianza) ? r.data.confianza : 0;
  const confianza = codigo ? Math.min(1, Math.max(0, bruta > 1 && bruta <= 100 ? bruta / 100 : bruta)) : 0;
  const lectura: LecturaPlaca = { codigo, confianza, nota: r.data.nota.trim().slice(0, 160) };
  return NextResponse.json(lectura);
}
