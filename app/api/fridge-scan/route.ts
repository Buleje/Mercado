import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateObject } from "ai";

/**
 * POST /api/fridge-scan — Analiza foto de refri/despensa con IA vision.
 *
 * Entrada: multipart/form-data con campo "image" (File).
 * Salida: { detected: [names], suggested: [{name, qty, reason}] }
 *
 * Modelo: "anthropic/claude-haiku-4-5" soporta input multi-modal (imagen).
 * La imagen se pasa como data URL base64 al modelo.
 *
 * Sin AI key → fallback mock con lista tipica peruana.
 */

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_IMAGE_SIZE_MB = 8;
const ACCEPTED_MIME = ["image/jpeg", "image/png", "image/webp", "image/heic"];

const DetectedSchema = z.object({
  detected: z.array(z.string().min(1).max(60)).max(30),
  suggested: z
    .array(
      z.object({
        name: z.string().min(1).max(60),
        qty: z.number().positive().max(20),
        unit: z.string().max(20).optional(),
        reason: z.string().max(120),
      }),
    )
    .max(15),
});

const MOCK_RESPONSE = {
  detected: ["Arroz", "Aceite Primor", "Sal", "Cebolla", "Tomate", "Huevos"],
  suggested: [
    {
      name: "Leche evaporada",
      qty: 2,
      unit: "latas",
      reason: "Suele acompañar el desayuno y no se ve en la foto",
    },
    {
      name: "Pollo trozado",
      qty: 1,
      unit: "kg",
      reason: "Básico para almuerzo — no hay proteína visible",
    },
    {
      name: "Pan francés",
      qty: 6,
      unit: "unidades",
      reason: "No detectamos pan fresco",
    },
    {
      name: "Papa amarilla",
      qty: 2,
      unit: "kg",
      reason: "Completa la canasta diaria peruana",
    },
  ],
};

const VISION_PROMPT = `Analiza esta foto de un refrigerador o despensa peruana. Devolve:

1. detected: lista de productos visibles (nombres comunes peruanos, max 30 items).
2. suggested: 5-10 productos que el usuario debería reponer/agregar, priorizando canasta basica peruana (arroz, aceite, azucar, fideos, huevos, leche, pollo, verduras, pan).

Para cada sugerencia:
- name: nombre simple capitalizado
- qty: cantidad realista para familia peruana semanal
- unit: kg, g, litros, unidades, docena, paquete
- reason: corta (max 20 palabras) explicando por qué lo sugieres

Reglas:
- Si la foto no es de comida/despensa, devuelve detected vacio y suggested vacio.
- Si la foto esta borrosa u oscura, igual haz tu mejor esfuerzo.
- No sugieras productos de lujo ni importados caros.
- Prioriza basicos peruanos.`;

async function fileToDataUrl(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");
  return `data:${file.type};base64,${base64}`;
}

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "FormData invalida" }, { status: 400 });
  }

  const imageField = form.get("image");
  if (!imageField || typeof imageField === "string") {
    return NextResponse.json(
      { error: "Campo 'image' requerido como archivo" },
      { status: 400 },
    );
  }

  const file = imageField as File;

  if (!ACCEPTED_MIME.includes(file.type)) {
    return NextResponse.json(
      { error: `Solo imagen JPG, PNG, WebP o HEIC (recibimos ${file.type})` },
      { status: 400 },
    );
  }

  if (file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
    return NextResponse.json(
      { error: `Imagen demasiado grande (max ${MAX_IMAGE_SIZE_MB}MB)` },
      { status: 400 },
    );
  }

  const hasAiKey =
    !!process.env.AI_GATEWAY_API_KEY || !!process.env.ANTHROPIC_API_KEY;

  if (!hasAiKey) {
    return NextResponse.json({ ...MOCK_RESPONSE, source: "mock" });
  }

  try {
    const dataUrl = await fileToDataUrl(file);
    const { object } = await generateObject({
      model: "anthropic/claude-haiku-4-5",
      schema: DetectedSchema,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: VISION_PROMPT },
            { type: "image", image: dataUrl },
          ],
        },
      ],
      temperature: 0.3,
    });
    return NextResponse.json({ ...object, source: "ai" });
  } catch (err) {
    return NextResponse.json({
      ...MOCK_RESPONSE,
      source: "fallback",
      warn: err instanceof Error ? err.message : "AI error",
    });
  }
}
