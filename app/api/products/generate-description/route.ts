import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { generateText } from "ai";
import { chatModel } from "@/lib/ai/provider";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { aiCostGuard } from "@/lib/ai/cost-control";

/**
 * POST /api/products/generate-description
 *
 * Genera una descripción comercial breve (2-3 oraciones) para un producto
 * de bodega/marketplace peruano, dado nombre + categoría + atributos.
 *
 * Usa chatModel (Haiku 4.5) — rápido, barato y nativo en español.
 * Auth: requireAdmin. Rate limit: STRICT preset (10 req/15min por tenant+IP)
 * para frenar abuso de generación masiva.
 */

const Input = z.object({
  name: z.string().min(1).max(200),
  category: z.string().max(80).optional().nullable(),
  attributes: z.string().max(300).optional().nullable(),
  tone: z.enum(["neutral", "friendly", "premium", "playful"]).default("friendly"),
});

const TONE_HINTS: Record<z.infer<typeof Input>["tone"], string> = {
  neutral: "tono informativo y directo, sin exageraciones",
  friendly: "tono cercano y cálido, estilo bodega de barrio peruana",
  premium: "tono elegante, evocando calidad y selección cuidada",
  playful: "tono divertido y juvenil, con humor amable",
};

export async function POST(req: NextRequest) {
  // Rate limit anti-abuso (fix: faltaba await)
  const rl = await applyRateLimit(req, "STRICT", "ai:product-description");
  if (rl) return rl;

  // Auth admin/almacenero
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const parsed = Input.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const { name, category, attributes, tone } = parsed.data;

    // F4: Cap mensual por plan de tenant — estimado ~0.001 USD por descripción (Haiku)
    const estimatedCost = 0.001;
    // auth.plan no existe en el JWT payload — fallback "free" (cap conservador).
    if (!await aiCostGuard.canSpend(auth.tenantId, estimatedCost, "free")) {
      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      nextMonth.setDate(1);
      const resetTs = Math.floor(nextMonth.getTime() / 1000);
      return NextResponse.json(
        { error: "Límite mensual de generaciones IA alcanzado. Actualizá tu plan o esperá el próximo mes." },
        {
          status: 429,
          headers: { "Retry-After": String(resetTs) },
        },
      );
    }

    const prompt = `Generá una descripción de producto para una bodega/marketplace en Perú.

Producto: ${name}
${category ? `Categoría: ${category}` : ""}
${attributes ? `Atributos: ${attributes}` : ""}

Tono: ${TONE_HINTS[tone]}

Reglas estrictas:
- Español de Perú natural, NUNCA voseo argentino.
- 2 a 3 oraciones, máximo 280 caracteres en total.
- Comenzá describiendo qué es y para qué sirve.
- Mencioná sin exagerar 1-2 atributos diferenciadores (origen, calidad, presentación, uso típico).
- NO inventes datos nutricionales, ingredientes específicos ni certificaciones.
- NO uses emojis.
- NO uses palabras vacías como "increíble", "lo mejor del mercado".
- NO uses muletillas tipo "¡Descubrí!" o "¡Llevátelo!".

Devolvé EXCLUSIVAMENTE el texto de la descripción, sin comillas, sin markdown, sin prefijos.`;

    const result = await generateText({
      model: chatModel,
      prompt,
      maxOutputTokens: 200,
      temperature: 0.7,
    });

    const description = result.text
      .trim()
      .replace(/^["']|["']$/g, "")
      .replace(/^Descripción:\s*/i, "")
      .slice(0, 320);

    if (!description || description.length < 20) {
      return NextResponse.json(
        { error: "El modelo no devolvió una descripción válida" },
        { status: 502 },
      );
    }

    // Registrar gasto real (fire-and-forget)
    aiCostGuard.recordSpend(auth.tenantId, estimatedCost);

    return NextResponse.json({ description });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    logger.error("[generate-description] error", { err: msg });
    return NextResponse.json(
      { error: "Falló la generación", detail: msg },
      { status: 500 },
    );
  }
}
