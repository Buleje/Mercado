import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { applyRateLimit } from "@/lib/rate-limit";
import { requireAdmin } from "@/lib/require-admin";
import { aiCostGuard } from "@/lib/ai/cost-control";
import { visionExtractJSON } from "@/lib/ai/vision-extract";
import { isSpecializationEnabled } from "@/lib/specializations";

/**
 * /api/admin/forestal/sniffs-ocr — lee una FOTO de la pantalla «Detalle de la
 * programación de producción» del SNIFFS (ADR-398).
 *
 * El OCR del navegador (`lib/ocr/ocr-navegador.ts`) alcanza y sobra para una
 * captura: texto impreso, píxeles limpios, gratis y sin salir de la máquina.
 * Una FOTO de un monitor o de un papel es otra cosa —reflejos, perspectiva,
 * enfoque— y ahí sí hace falta un modelo de visión. Por eso esta ruta es el
 * SEGUNDO intento y no el primero: cuesta plata por imagen y sube la foto.
 *
 * No escribe nada. Devuelve lo leído para que el operador lo revise en la misma
 * tabla que el pegado local, con las mismas reglas: lo que no se lee vuelve
 * vacío, nunca inventado.
 */

const MAX_IMAGE_B64_BYTES = 10_000_000;
const OCR_COST_USD = 0.015;

const RequestSchema = z.object({
  image: z.string().min(100, "Imagen requerida").max(MAX_IMAGE_B64_BYTES, "Imagen muy grande (>10MB)"),
});

const ProductoSchema = z.object({
  producto: z.string().default(""),
  volumenM3: z.coerce.number().min(0).default(0),
  pctAprovechado: z.coerce.number().default(0),
});

const ResponseSchema = z.object({
  lote: z.string().default(""),
  fechaInicio: z.string().default(""),
  fechaFin: z.string().default(""),
  especieCientifica: z.string().default(""),
  especieComun: z.string().default(""),
  volumenConsumidoM3: z.coerce.number().min(0).default(0),
  productos: z.array(ProductoSchema).max(40).default([]),
  advertencia: z.string().default(""),
});

const JSON_SCHEMA = {
  type: "object",
  properties: {
    lote: { type: "string" },
    fechaInicio: { type: "string" },
    fechaFin: { type: "string" },
    especieCientifica: { type: "string" },
    especieComun: { type: "string" },
    volumenConsumidoM3: { type: "number" },
    productos: {
      type: "array",
      items: {
        type: "object",
        properties: {
          producto: { type: "string" },
          volumenM3: { type: "number" },
          pctAprovechado: { type: "number" },
        },
        required: ["producto", "volumenM3", "pctAprovechado"],
        additionalProperties: false,
      },
    },
    advertencia: { type: "string" },
  },
  required: [
    "lote", "fechaInicio", "fechaFin", "especieCientifica", "especieComun",
    "volumenConsumidoM3", "productos", "advertencia",
  ],
  additionalProperties: false,
};

const PROMPT =
  "Esta es una foto de la pantalla «Detalle de la programación de producción» del SNIFFS, el sistema " +
  "forestal de SERFOR (Perú). Puede ser una foto de un monitor, con reflejos o en ángulo.\n\n" +
  "Devuelve:\n" +
  "- lote: el «N° de Lote» (ej. «18-2026»).\n" +
  "- fechaInicio y fechaFin: en formato AAAA-MM-DD (en pantalla están como DD/MM/AAAA).\n" +
  "- especieCientifica y especieComun: la especie viene como «Cedrelinga cateniformis - TORNILLO»; " +
  "el nombre científico va en una y el común (en mayúsculas) en la otra.\n" +
  "- volumenConsumidoM3: el «Volumen consumido», en m³. Si el campo está vacío o no se lee, 0.\n" +
  "- productos: UNA entrada por fila del cuadro «Resumen de Producción por PMF y Producto», con el " +
  "nombre del producto TAL CUAL está escrito (ej. «MADERA ASERRADA (PAQUETERIA CORTA)»), su volumen " +
  "en m³ y su porcentaje aprovechado.\n\n" +
  "Los volúmenes del SNIFFS llevan TRES decimales (0.002, 9.753, 5.456): no los redondees ni les " +
  "muevas el punto. Si una fila no se lee con confianza, dejala fuera y explica en advertencia. " +
  "Si la foto no es esa pantalla, devuelve productos: [] y di en advertencia qué se ve.";

async function ensureSpec(tenantId: string) {
  const ok = await isSpecializationEnabled(tenantId, "spec:forestal:ctp-libro");
  return ok ? null : NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
}

export async function POST(req: NextRequest) {
  const rl = await applyRateLimit(req, "STRICT", "sniffs-ocr");
  if (rl) return rl;
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  const canSpend = await aiCostGuard.canSpend(auth.tenantId, OCR_COST_USD);
  if (!canSpend) {
    return NextResponse.json(
      { error: "budget_exceeded", message: "Presupuesto de IA agotado este mes." },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  }

  const result = await visionExtractJSON({
    imageBase64: parsed.data.image,
    prompt: PROMPT,
    schema: ResponseSchema,
    jsonSchema: JSON_SCHEMA,
    maxTokens: 2000,
    logTag: "[sniffs-ocr]",
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, raw: result.raw }, { status: result.status });
  }
  await aiCostGuard.recordSpend(auth.tenantId, OCR_COST_USD);
  return NextResponse.json(result.data);
}
