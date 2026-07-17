import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AI_TEMPERATURES } from "@/lib/ai-temperatures";
import { safeParseJSON } from "@/lib/ai-json-parser";
import { applyRateLimit } from "@/lib/rate-limit";
import { requireAdmin } from "@/lib/require-admin";
import { aiCostGuard } from "@/lib/ai/cost-control";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";

/**
 * /api/admin/forestal/gtf-ocr — extrae los datos de una GTF (Guía de Transporte
 * Forestal) fotografiada para pre-llenar el ingreso de madera. Mismo patrón que
 * /api/ocr/invoice (auth + aiCostGuard + Vision OpenAI→Anthropic + Zod), acotado
 * al vocabulario de una GTF peruana. NO reemplaza la validación humana: el
 * operador revisa y corrige antes de guardar.
 */

const MAX_IMAGE_B64_BYTES = 10_000_000;
const OCR_COST_USD = 0.01;

const RequestSchema = z.object({
  image: z.string().min(100, "Imagen requerida").max(MAX_IMAGE_B64_BYTES, "Imagen muy grande (>10MB)"),
});

const GtfSchema = z.object({
  gtfNumber: z.string().default(""),
  gtfSeries: z.string().default(""),
  especie: z.string().default(""),
  especieCientifica: z.string().default(""),
  volumenM3: z.coerce.number().min(0).default(0),
  proveedor: z.string().default(""),
  ruc: z.string().default(""),
  fecha: z.string().default(""),
  origen: z.string().default(""),
});

const PROMPT =
  "Extrae los datos de esta Guía de Transporte Forestal (GTF) peruana de SERFOR. " +
  "Devuelve SOLO JSON válido sin markdown con: gtfNumber (número de la guía), gtfSeries (serie si aparece), " +
  "especie (nombre común de la especie forestal), especieCientifica (nombre científico si aparece), " +
  "volumenM3 (volumen total en m³ como número), proveedor (titular/remitente), ruc (RUC del titular), " +
  'fecha (YYYY-MM-DD), origen (concesión/predio/comunidad de procedencia). ' +
  'Formato: {"gtfNumber":"","gtfSeries":"","especie":"","especieCientifica":"","volumenM3":0,"proveedor":"","ruc":"","fecha":"","origen":""}. ' +
  "Si un dato no se lee, dejalo vacío o 0.";

async function ensureSpec(tenantId: string) {
  const ok = await isSpecializationEnabled(tenantId, "spec:forestal:ctp-libro");
  return ok ? null : NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
}

export async function POST(req: NextRequest) {
  const rl = await applyRateLimit(req, "STRICT", "gtf-ocr");
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
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  const { image } = parsed.data;

  try {
    const openai = process.env.OPENAI_API_KEY;
    const anthropic = process.env.ANTHROPIC_API_KEY;
    let content = "";

    if (openai) {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${openai}` },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "Eres un extractor de datos de Guías de Transporte Forestal peruanas. Responde SOLO JSON válido sin markdown." },
            { role: "user", content: [{ type: "text", text: PROMPT }, { type: "image_url", image_url: { url: image.startsWith("data:") ? image : `data:image/jpeg;base64,${image}` } }] },
          ],
          max_tokens: 800,
          temperature: AI_TEMPERATURES.extraction,
        }),
      });
      if (!res.ok) return NextResponse.json({ error: `API error: ${res.status}` }, { status: 502 });
      content = (await res.json()).choices?.[0]?.message?.content ?? "";
    } else if (anthropic) {
      const imageData = image.startsWith("data:") ? image.split(",")[1] : image;
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": anthropic, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 800,
          messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: imageData } }, { type: "text", text: PROMPT }] }],
        }),
      });
      if (!res.ok) return NextResponse.json({ error: `API error: ${res.status}` }, { status: 502 });
      content = (await res.json()).content?.[0]?.text ?? "";
    } else {
      return NextResponse.json({ error: "No se encontró API key para OCR (OPENAI_API_KEY o ANTHROPIC_API_KEY)" }, { status: 500 });
    }

    const result = safeParseJSON(content, GtfSchema);
    if (!result.ok) {
      return NextResponse.json({ error: "No se pudo interpretar la GTF", raw: content }, { status: 422 });
    }
    await aiCostGuard.recordSpend(auth.tenantId, OCR_COST_USD);
    return NextResponse.json(result.data);
  } catch (error) {
    logger.error("[gtf-ocr] failed", { error: String(error), tenantId: auth.tenantId });
    return NextResponse.json({ error: `Error procesando la GTF: ${error instanceof Error ? error.message : "desconocido"}` }, { status: 500 });
  }
}
