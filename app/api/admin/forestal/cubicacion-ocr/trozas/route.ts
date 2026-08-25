import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { applyRateLimit } from "@/lib/rate-limit";
import { requireAdmin } from "@/lib/require-admin";
import { aiCostGuard } from "@/lib/ai/cost-control";
import { visionExtractJSON } from "@/lib/ai/vision-extract";
import { isSpecializationEnabled } from "@/lib/specializations";

/**
 * /api/admin/forestal/cubicacion-ocr/trozas — lee una foto de una planilla de
 * cubicación de trozas (rolliza, Ø menor/Ø mayor/largo) llenada a mano en
 * patio y devuelve las filas SIN cubicar todavía. El Smalian se recalcula
 * client-side (`interpretarOcrTrozas` en cubicacion-trozas-import.ts) igual
 * que en el import de Excel — nunca se confía en un m³ que "diga" la foto.
 *
 * NO escribe nada: el operador revisa el preview y confirma antes de que
 * las trozas entren al patio (mismo modal que el import de Excel).
 */

const MAX_IMAGE_B64_BYTES = 10_000_000;
const OCR_COST_USD = 0.015;

const RequestSchema = z.object({
  image: z.string().min(100, "Imagen requerida").max(MAX_IMAGE_B64_BYTES, "Imagen muy grande (>10MB)"),
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

const PROMPT =
  "Esta es una foto de una PLANILLA DE CUBICACIÓN DE TROZAS (madera rolliza) escrita a mano por un " +
  "operario forestal peruano en el patio. Suele traer columnas para el diámetro menor (Ø1), el diámetro " +
  "mayor (Ø2) y el largo, y a veces la especie — o aparecer como tríos de números por línea. Puede tener " +
  "tachones o correcciones: usá el valor final, no el tachado.\n\n" +
  "Para CADA troza (fila o línea) que puedas identificar, devolvé:\n" +
  "- d1: diámetro MENOR en centímetros (número).\n" +
  "- d2: diámetro MAYOR en centímetros. Si sólo hay un diámetro anotado, repetilo en d1 y d2.\n" +
  "- largo: longitud en METROS (número).\n" +
  "- especie: si está escrita en esa fila o en un encabezado que aplica a todo el bloque; si no hay, dejalo vacío.\n" +
  "- incierto: true si algún número de ESA fila es ambiguo o dudoso (por ejemplo no distinguís un 3 de un 8 " +
  "o un 40 de un 46), false si se lee con confianza.\n\n" +
  "Si la foto no parece una planilla de cubicación de trozas, devolvé trozas: [] y advertencia con una " +
  "frase corta explicando qué ves en cambio. Si hay zonas ilegibles, devolvé las filas que SÍ se puedan " +
  "leer y dejá esas fuera — nunca inventes un valor para lo que no se lee.";

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

  const result = await visionExtractJSON({
    imageBase64: parsedReq.data.image,
    prompt: PROMPT,
    schema: ResponseSchema,
    jsonSchema: JSON_SCHEMA,
    maxTokens: 4000,
    logTag: "[cubicacion-ocr:trozas]",
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, raw: result.raw }, { status: result.status });
  }
  await aiCostGuard.recordSpend(auth.tenantId, OCR_COST_USD);
  return NextResponse.json(result.data);
}
