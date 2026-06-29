import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { generateText } from "ai";
import { chatModel, getActiveProvider } from "@/lib/ai/provider";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { aiCostGuard } from "@/lib/ai/cost-control";
import { trackAiUsage } from "@/lib/ai/track-usage";

/**
 * POST /api/store-page/ai-content
 *
 * "Generar con IA" por sección (Modo Creativo, audit #3 #11). El dueño tiene el
 * nombre + rubro del negocio configurados; la IA propone el CONTENIDO de la
 * sección (Sobre nosotros / FAQ / Beneficios / Cómo pedir) para que no parta de
 * cero. Devuelve SOLO JSON estructurado (Zod safeParse) que el editor mergea en
 * section.data. Mismo patrón que ai-theme: auth + rate-limit + cost guard + 503
 * si no hay proveedor de IA. Copy en español de Perú (tuteo), sin emojis.
 */
const BENEFIT_ICONS = ["truck", "shield", "clock", "tag", "heart", "sparkles"] as const;

const Input = z.object({
  sectionType: z.enum(["about", "faq", "benefits", "how-to-order"]),
  storeName: z.string().max(120).optional().nullable(),
  rubro: z.string().max(80).optional().nullable(),
});

// Schema de salida por tipo de sección.
const OUT = {
  about: z.object({ title: z.string().min(2).max(80), body: z.string().min(20).max(1500) }),
  faq: z.object({ items: z.array(z.object({ question: z.string().min(4).max(120), answer: z.string().min(4).max(400) })).min(3).max(6) }),
  benefits: z.object({ items: z.array(z.object({ icon: z.enum(BENEFIT_ICONS), title: z.string().min(2).max(40), description: z.string().min(4).max(140) })).min(3).max(5) }),
  "how-to-order": z.object({ subtitle: z.string().max(140).optional(), steps: z.array(z.object({ title: z.string().min(2).max(40), description: z.string().min(4).max(160) })).min(3).max(5) }),
} as const;

function buildPrompt(type: string, biz: string): string {
  const base = `Sos redactor de marketing para tiendas online de barrio en Perú. Negocio: ${biz}.
Escribí en español de Perú, tuteo natural ("Pedí", "Elegí", "tu pedido"), NUNCA voseo argentino, sin emojis, sin signos de exclamación excesivos. Concreto y cálido.
Devolvé EXCLUSIVAMENTE un objeto JSON válido (sin markdown, sin texto antes ni después).`;
  switch (type) {
    case "about":
      return `${base}
Generá la sección "Sobre nosotros" con estas claves EXACTAS:
{ "title": "...", "body": "..." }
- title: corto (ej. "Sobre nosotros" o algo propio del negocio), máx 60 chars.
- body: 2-3 párrafos (separados por saltos de línea \\n) que cuenten quiénes son, qué ofrecen y por qué elegirlos. Máx 800 chars. NO inventes datos falsos (premios, años exactos) que no se deduzcan del rubro.`;
    case "faq":
      return `${base}
Generá 5 preguntas frecuentes típicas del rubro con esta forma EXACTA:
{ "items": [ { "question": "...", "answer": "..." }, ... ] }
Cubrí: medios de pago, delivery/tiempos, zona de cobertura, pedido mínimo, horarios. Respuestas breves y útiles.`;
    case "benefits":
      return `${base}
Generá 4 beneficios de comprar en esta tienda con esta forma EXACTA:
{ "items": [ { "icon": "uno de: truck|shield|clock|tag|heart|sparkles", "title": "...", "description": "..." }, ... ] }
Elegí el icon que mejor represente cada beneficio (truck=delivery, shield=confianza/seguridad, clock=rapidez, tag=precio/oferta, heart=atención, sparkles=calidad/novedad).`;
    default: // how-to-order
      return `${base}
Generá los pasos de "Cómo pedir" con esta forma EXACTA:
{ "subtitle": "...", "steps": [ { "title": "...", "description": "..." }, ... ] }
3 a 4 pasos claros (ej. elegir productos → confirmar por WhatsApp → pagar → recibir). subtitle opcional breve.`;
  }
}

export async function POST(req: NextRequest) {
  const rl = await applyRateLimit(req, "STRICT", "ai:section-content");
  if (rl) return rl;

  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  if (getActiveProvider() === "none") {
    return NextResponse.json(
      { error: "La IA no está disponible en este entorno (falta configurar la clave del proveedor)." },
      { status: 503 },
    );
  }

  const parsed = Input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
  }
  const { sectionType, storeName, rubro } = parsed.data;

  if (!(await aiCostGuard.canSpend(auth.tenantId, 0.001))) {
    return NextResponse.json(
      { error: "Llegaste al límite mensual de generaciones con IA. Actualizá tu plan o esperá el próximo mes." },
      { status: 429 },
    );
  }

  const biz = `${storeName ? `"${storeName}" — ` : ""}${rubro || "tienda/bodega de barrio"}`;
  const prompt = buildPrompt(sectionType, biz);

  try {
    const result = await trackAiUsage(
      { tenantId: auth.tenantId, feature: "section-content", model: "claude-haiku-4-5" },
      () => generateText({ model: chatModel, prompt, maxOutputTokens: 700, temperature: 0.7 }),
    );
    const raw = result.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      logger.error("[ai-content] respuesta no-JSON", { raw: raw.slice(0, 200) });
      return NextResponse.json({ error: "La IA no devolvió contenido válido. Probá de nuevo." }, { status: 502 });
    }
    const out = OUT[sectionType].safeParse(json);
    if (!out.success) {
      logger.error("[ai-content] JSON fuera de schema", { type: sectionType, issues: out.error.issues });
      return NextResponse.json({ error: "La IA devolvió contenido incompleto. Probá de nuevo." }, { status: 502 });
    }
    return NextResponse.json({ data: out.data });
  } catch (e) {
    logger.error("[ai-content] error", { err: e instanceof Error ? e.message : String(e), tenantId: auth.tenantId });
    return NextResponse.json({ error: "Error al generar contenido con IA." }, { status: 503 });
  }
}
