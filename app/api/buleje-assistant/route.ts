import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateText } from "ai";

/**
 * POST /api/buleje-assistant — Asistente Buleje 24/7.
 *
 * Chatbot global del marketplace que responde:
 *   - Dudas de productos, precios, disponibilidad
 *   - Recomendaciones (qué va con X, recetas)
 *   - Soporte (delivery, pago, tracking, devoluciones)
 *   - Busqueda en lenguaje natural
 *
 * Uso gateway Vercel AI con plain string "anthropic/claude-haiku-4-5".
 * MVP sin streaming (generateText). Si no hay AI key, devuelve 503 con
 * mensaje de WhatsApp fallback.
 */

// Next 16 + cacheComponents prohibe segment configs — runtime se infiere de
// Fluid Compute. maxDuration se configura en vercel.ts (ADR-019).
export const maxDuration = 30;

const RequestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4000),
      }),
    )
    .min(1)
    .max(30),
});

const SYSTEM_PROMPT = `Eres "Buleje AI", el asistente 24/7 del marketplace Buleje — bodegas y tiendas locales del Peru (originado en Pucallpa).

CONTEXTO DEL NEGOCIO:
- Marketplace de bodegas, minimarkets, farmacias, carnicerias, fruterias.
- Delivery 25-45 min en Pucallpa (zonas: Centro, Yarinacocha, Manantay, Calleria, Campo Verde).
- Pago: Yape, Plin, efectivo contra entrega, tarjeta.
- Envio gratis sobre S/ 50. Debajo: S/ 5.
- Cupones por tienda. Programa de puntos Socio Buleje.
- Reviews con fotos verificadas.

TU ROL:
- Responde en espanol peruano natural, conciso, amigable.
- NUNCA inventas productos ni precios especificos. Si preguntan por uno concreto, sugiere /marketplace/buscar.
- Para pedidos activos, redirige a /marketplace/mi-cuenta/pedidos.
- Para tracking, redirige a /tracking/ORDER_ID.
- Para soporte humano, sugiere WhatsApp +51 916 409 675.
- Si piden recomendar recetas, menciona nuestra Chef-IA en /marketplace/chef-ia.

REGLAS:
- Maximo 3 parrafos por respuesta.
- Sin emojis.
- Si no sabes algo especifico, dilo claro: "No tengo esa info, pero te puedo ayudar con X".
- NUNCA pidas datos sensibles (CVV, passwords, DNI completo).`;

export async function POST(req: NextRequest) {
  // SECURITY 2026-05-12 (H3 audit AI): bucket cost por IP en lugar de global.
  // Antes "__public_assistant__" era global → 1 atacante quemaba el budget de
  // TODOS los usuarios anónimos. Ahora cada IP tiene su propio cap mensual.
  const { applyRateLimit } = await import("@/lib/rate-limit");
  const rl = applyRateLimit(req, "STRICT", "buleje-assistant");
  if (rl) return rl;
  const { aiCostGuard } = await import("@/lib/ai/cost-control");
  const ESTIMATED_COST_USD = 0.0008;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const bucketKey = `__public_assistant__:${ip}`;
  if (!await aiCostGuard.canSpend(bucketKey, ESTIMATED_COST_USD, "free")) {
    return NextResponse.json(
      { error: "AI quota exceeded. Try again later." },
      { status: 429 },
    );
  }
  aiCostGuard.recordSpend(bucketKey, ESTIMATED_COST_USD);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Parametros invalidos", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const hasAiKey =
    !!process.env.AI_GATEWAY_API_KEY || !!process.env.ANTHROPIC_API_KEY;

  if (!hasAiKey) {
    return NextResponse.json(
      {
        error:
          "El asistente esta en configuracion. Por ahora escribinos a WhatsApp +51 916 409 675.",
      },
      { status: 503 },
    );
  }

  try {
    const { text } = await generateText({
      model: "anthropic/claude-haiku-4-5",
      system: SYSTEM_PROMPT,
      messages: parsed.data.messages,
      temperature: 0.6,
    });
    return NextResponse.json({ reply: text });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error del asistente" },
      { status: 500 },
    );
  }
}
