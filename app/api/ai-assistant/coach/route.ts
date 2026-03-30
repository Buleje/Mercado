export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { logActivity } from "@/lib/activity-logger";
import {
  generateBusinessSnapshot,
  isQuincena,
  getTemporada,
  getProximoFeriado,
  getContextoFecha,
} from "@/lib/ai-business-snapshot";
import { z } from "zod";

// ── Zod schema ──────────────────────────────────────────────────────────────

const CoachBodySchema = z.object({
  message: z.string().min(1, "Mensaje requerido").max(2000),
  context: z
    .enum(["briefing", "plan", "diagnostico", "coach", "simulador"])
    .optional()
    .default("coach"),
  history: z
    .array(z.object({ role: z.string(), content: z.string() }))
    .optional()
    .default([]),
});

// ── System prompt for coach ─────────────────────────────────────────────────

function buildCoachSystemPrompt(
  businessSnapshot: string,
  fecha: string,
  contextoFecha: string,
  esQuincena: boolean,
  feriado: string,
  temporada: string,
  context: string
): string {
  const contextHints: Record<string, string> = {
    briefing:
      "El usuario quiere un BRIEFING DIARIO. Resume la situación actual, alertas urgentes, y las 3 acciones prioritarias del día. Sé conciso y accionable.",
    plan:
      "El usuario quiere un PLAN ESTRATÉGICO. Analiza tendencias, sugiere acciones a mediano plazo (1-4 semanas), enfócate en crecimiento y optimización.",
    diagnostico:
      "El usuario quiere un DIAGNÓSTICO del negocio. Identifica fortalezas, debilidades, riesgos y oportunidades basándote en los datos. Sé analítico.",
    coach:
      "El usuario busca COACHING de negocio. Responde como mentor experimentado en retail, con consejos prácticos y motivación.",
    simulador:
      'El usuario quiere SIMULAR escenarios. Ayúdale a explorar "qué pasaría si..." con sus datos reales. Muestra números y proyecciones.',
  };

  return `Eres un consultor de negocios experto en abarrotes y retail peruano,
específicamente en Pucallpa, Ucayali. Conoces profundamente:
- El ciclo comercial peruano (quincenas, fiestas patrias, día de la madre, navidad)
- La realidad económica de Pucallpa (clima tropical, temporada de lluvias dic-mar, cosecha de cacao/café)
- Estrategias de fiado digital para bodegas
- Márgenes típicos de abarrotes en Perú (22-35%)
- Patrones de compra locales

MODO: ${context.toUpperCase()}
${contextHints[context] ?? contextHints.coach}

DATOS DEL NEGOCIO (actualizados en tiempo real):
${businessSnapshot}

CALENDARIO: Hoy es ${fecha}. ${contextoFecha}
- ¿Es quincena? ${esQuincena ? "SÍ — pico de ventas esperado" : "No"}
- ¿Feriado próximo? ${feriado}
- ¿Temporada? ${temporada}

Responde en español peruano, máximo 400 palabras. Sé directo y práctico.
Da consejos específicos con números de SU negocio, no genéricos.
Usa formato Markdown con bullets y negritas.
Prioriza: dinero > clientes > inventario > operaciones.`;
}

// ── Rule-based fallback ─────────────────────────────────────────────────────

function generateFallbackResponse(
  metrics: Record<string, unknown>,
  fecha: string,
  temporada: string,
  feriadoStr: string
): string {
  return (
    `**Resumen del negocio (${fecha}):**\n\n` +
    `- Ventas hoy: S/${metrics.todayRevenue}\n` +
    `- Ventas mes: S/${metrics.monthRevenue} (Margen: ${metrics.margin}%)\n` +
    `- Pedidos pendientes: ${metrics.pendingOrders}\n` +
    `- Sin stock: ${metrics.outOfStockCount} productos\n` +
    `- Fiados pendientes: S/${metrics.totalFiadosPendiente}\n` +
    `- ${temporada}\n` +
    `- ${feriadoStr}\n\n` +
    `_Configura GROQ_API_KEY para activar el coach IA completo._`
  );
}

// ── POST handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;

  const rateLimited = applyRateLimit(req, "MODERATE", "ai-coach");
  if (rateLimited) return rateLimited;

  const raw = await req.json().catch(() => ({}));
  const parsed = CoachBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { message, context, history } = parsed.data;

  // Build snapshot
  const snapshot = await generateBusinessSnapshot(auth.tenantId);

  // Calendar context
  const d = new Date();
  const fecha = d.toISOString().slice(0, 10);
  const contextoFecha = getContextoFecha(d);
  const esQuincenaHoy = isQuincena(d);
  const temporada = getTemporada(d);
  const proximoFeriado = getProximoFeriado(d);
  const feriadoStr = proximoFeriado
    ? `${proximoFeriado.nombre} en ${proximoFeriado.diasAntes} días`
    : "Ninguno próximo";

  const systemPrompt = buildCoachSystemPrompt(
    snapshot.text,
    fecha,
    contextoFecha,
    esQuincenaHoy,
    feriadoStr,
    temporada,
    context
  );

  // Fire-and-forget logging
  logActivity(
    "ai_coach",
    "ai-assistant",
    `Coach ${context}: ${message.slice(0, 100)}`,
    undefined,
    auth.username
  ).catch(() => {});

  // ── Check for Groq API key ────────────────────────────────────────────────

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    logger.warn("[ai-coach] GROQ_API_KEY not configured — using rule-based fallback");
    return NextResponse.json({
      response: generateFallbackResponse(snapshot.metrics, fecha, temporada, feriadoStr),
      mode: "rule-based" as const,
      snapshot: snapshot.metrics,
    });
  }

  // ── Build messages for Groq (same pattern as ai-assistant/route.ts) ───────

  const messages = [
    { role: "system" as const, content: systemPrompt },
    ...history.slice(-8).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user" as const, content: message },
  ];

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages,
        temperature: 0.6,
        max_tokens: 1500,
        stream: true,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[ai-coach] Groq API error:", res.status, errText);
      return NextResponse.json({
        response: generateFallbackResponse(snapshot.metrics, fecha, temporada, feriadoStr),
        mode: "rule-based" as const,
        snapshot: snapshot.metrics,
      });
    }

    // ── Streaming response (same pattern as ai-assistant/route.ts) ──────────

    if (res.body) {
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();

      const stream = new ReadableStream({
        async start(controller) {
          const reader = res.body!.getReader();
          let buffer = "";
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });

              const lines = buffer.split("\n");
              buffer = lines.pop() ?? "";

              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith("data: ")) continue;
                const payload = trimmed.slice(6);
                if (payload === "[DONE]") {
                  controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                  controller.close();
                  return;
                }
                try {
                  const json = JSON.parse(payload);
                  const content = json.choices?.[0]?.delta?.content;
                  if (content) {
                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify({ content })}\n\n`)
                    );
                  }
                } catch {
                  /* skip malformed chunk */
                }
              }
            }
            controller.close();
          } catch (err) {
            controller.error(err);
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    // ── Non-streaming fallback ──────────────────────────────────────────────
    const data = await res.json();
    const reply =
      data.choices?.[0]?.message?.content ?? "No pude generar una respuesta.";

    return NextResponse.json({
      response: reply,
      mode: "ai" as const,
      snapshot: snapshot.metrics,
    });
  } catch (err) {
    console.error(
      "[ai-coach] Fetch error:",
      err instanceof Error ? err.message : String(err)
    );
    return NextResponse.json({
      response: generateFallbackResponse(snapshot.metrics, fecha, temporada, feriadoStr),
      mode: "rule-based" as const,
      snapshot: snapshot.metrics,
    });
  }
}
