import { NextRequest } from "next/server";
import { streamText } from "ai";
import { z } from "zod";
import { chatModel } from "@/lib/ai/provider";
import { applyRateLimit } from "@/lib/rate-limit";
import { tryAdmin } from "@/lib/require-admin";
import { CUSTOMER_SESSION, getCustomerPayload } from "@/lib/auth/customer-session";
import { aiCostGuard } from "@/lib/ai/cost-control";
import { makeStreamUsageHandler } from "@/lib/ai/track-usage";
import { logger } from "@/lib/logger";
import { groqProvider } from "@/lib/llm-providers/groq";

// El slug del modelo que realmente se está usando, para reportarlo en la
// respuesta. Antes se re-tipeaba acá con un comentario que pedía «sincronizar
// a mano» — y no se sincronizó: quedó anunciando un modelo de Groq dado de baja
// mientras la llamada real usaba otro. Ahora se deriva de la MISMA fuente que
// `pickChatModel`, así no puede volver a divergir.
const CHAT_MODEL_SLUG = process.env.ANTHROPIC_API_KEY
  ? "claude-haiku-4-5-20251001"
  : process.env.GROQ_API_KEY
    ? groqProvider.models.cheap
    : "gpt-4o-mini";

const ChatInput = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string().min(1).max(2000),
    })
  ),
  // SECURITY 2026-05-06: tenantId del body REMOVIDO. Se ignora si llega.
  // Antes: cualquiera pasaba tenantId arbitrario en body y la IA hablaba con
  // contexto de OTRO tenant (cross-tenant prompt leak).
});

const SYSTEM_PROMPT = `Eres el asistente de la bodega. Ayudas a clientes a encontrar productos, hacer pedidos y resolver dudas. Responde en espanol, corto y amable.
Si no sabes algo, di "No tengo esa informacion, pero puedes preguntar en la bodega."
Nunca inventes precios ni disponibilidad.`;

export async function POST(req: NextRequest) {
  try {
    // SECURITY 2026-05-06 (audit AI #1): rate limit estricto. Antes endpoint era
    // anónimo + sin RL → atacante quemaba budget Anthropic.
    const rl = applyRateLimit(req, "STRICT", "ai-chat");
    if (rl) return rl;

    // SECURITY 2026-05-06 (audit AI #1): exigir sesión (admin del negocio o
    // customer del marketplace). Sin esto el endpoint era anónimo y se podía
    // disparar 1M req/día contra Anthropic.
    const adminSession = await tryAdmin(req);
    let resolvedTenantId: string | null = adminSession?.tenantId ?? null;
    if (!resolvedTenantId) {
      const ct = req.cookies.get(CUSTOMER_SESSION.COOKIE_NAME)?.value;
      if (ct) {
        const payload = await getCustomerPayload(ct);
        if (payload?.tenantId) resolvedTenantId = payload.tenantId;
      }
    }
    if (!resolvedTenantId) {
      // Fallback: storefront público vía header del proxy (ya validado por middleware).
      const headerTenant = req.headers.get("x-tenant-id");
      if (headerTenant && headerTenant !== "main") resolvedTenantId = headerTenant;
    }
    if (!resolvedTenantId) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }

    // SECURITY 2026-05-06 (audit AI #1 + #4): cost cap por tenant. Estimamos
    // ~$0.0008 por request (Haiku 4.5: 200 input + 1000 output tokens). Si el
    // tenant ya quemó su budget mensual, devolver 429.
    // Round 28+: el `recordSpend` aproximado se mantiene como pre-charge para
    // que el guardrail dispare antes; `makeStreamUsageHandler` registra DESPUÉS
    // el costo real basado en tokens (delta = corrección a la baja en Upstash
    // sigue siendo válida porque INCR es atómico aunque acumule estimación + real).
    const ESTIMATED_COST_USD = 0.0008;
    if (!await aiCostGuard.canSpend(resolvedTenantId, ESTIMATED_COST_USD)) {
      return Response.json(
        { error: "AI quota exceeded for this tenant. Upgrade your plan or try again next month." },
        { status: 429 },
      );
    }

    const body = await req.json();
    const parsed = ChatInput.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { messages } = parsed.data;

    // Round 28+: tracking event-based para streamText. Registra tokens reales,
    // costo real y duración cuando el stream termina (incluye finishReason
    // "abort" si el cliente canceló — caso explícito en abortSignal arriba).
    const onFinish = makeStreamUsageHandler({
      tenantId: resolvedTenantId,
      feature: "ai-chat",
      model: CHAT_MODEL_SLUG,
    });

    const result = streamText({
      model: chatModel,
      system: `${SYSTEM_PROMPT}\nTenant: ${resolvedTenantId}.`,
      messages,
      maxOutputTokens: 1000,
      // FIX 2026-05-06 (audit AI #8): cancelar inferencia si el cliente cierra
      // la conexión, para no facturar tokens que nadie va a leer.
      abortSignal: req.signal,
      onFinish,
    });

    return result.toUIMessageStreamResponse();

  } catch (e) {
    logger.error("[post] error", { err: e instanceof Error ? e.message : String(e) });
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
