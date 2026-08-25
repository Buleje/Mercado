import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { applyRateLimit } from "@/lib/rate-limit";
import { requireAdmin } from "@/lib/require-admin";
import { aiCostGuard } from "@/lib/ai/cost-control";
import { visionExtractJSON } from "@/lib/ai/vision-extract";
import { isSpecializationEnabled } from "@/lib/specializations";

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
 */

const MAX_IMAGE_B64_BYTES = 10_000_000;
const OCR_COST_USD = 0.015;

const RequestSchema = z.object({
  image: z.string().min(100, "Imagen requerida").max(MAX_IMAGE_B64_BYTES, "Imagen muy grande (>10MB)"),
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

const PROMPT =
  "Esta es una foto de una PLANILLA DE CUBICACIÓN DE MADERA ASERRADA (tablas/tablones) escrita a mano " +
  "por un operario forestal peruano. Suele traer columnas para cantidad de piezas, espesor, ancho y largo, " +
  "y a veces la especie — o aparecer como tríos \"espesor × ancho × largo\" por línea, con o sin cantidad " +
  "al inicio. Puede tener tachones o correcciones: usá el valor final, no el tachado.\n\n" +
  "Convención peruana: el espesor y el ancho se anotan en PULGADAS, el largo en PIES. Si una fila trae " +
  "explícitamente otra unidad (cm, metros), convertila vos a pulgadas/pies antes de responder — el número " +
  "que devuelvas siempre tiene que quedar en esas unidades.\n\n" +
  "Para CADA fila/línea que puedas identificar, devolvé:\n" +
  "- cantidad: cuántas piezas iguales representa esa línea. Si no está escrita, 1.\n" +
  "- espesor: en pulgadas (número).\n" +
  "- ancho: en pulgadas (número).\n" +
  "- largo: en pies (número).\n" +
  "- especie: si está escrita en esa fila o en un encabezado que aplica a todo el bloque; si no hay, dejalo vacío.\n" +
  "- incierto: true si algún número de ESA fila es ambiguo o dudoso, false si se lee con confianza.\n\n" +
  "Si la foto no parece una planilla de cubicación de madera aserrada, devolvé piezas: [] y advertencia con " +
  "una frase corta explicando qué ves en cambio. Si hay zonas ilegibles, devolvé las filas que SÍ se puedan " +
  "leer y dejá esas fuera — nunca inventes un valor para lo que no se lee.";

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

  const result = await visionExtractJSON({
    imageBase64: parsedReq.data.image,
    prompt: PROMPT,
    schema: ResponseSchema,
    jsonSchema: JSON_SCHEMA,
    maxTokens: 4000,
    logTag: "[cubicacion-ocr:aserrada]",
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, raw: result.raw }, { status: result.status });
  }
  await aiCostGuard.recordSpend(auth.tenantId, OCR_COST_USD);
  return NextResponse.json(result.data);
}
