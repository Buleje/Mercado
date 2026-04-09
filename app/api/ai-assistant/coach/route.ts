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
import { processSafeInput, buildInjectionGuard, detectPromptInjection, moderateLLMOutput } from "@/lib/ai-safety";
import { callLLM } from "@/lib/llm-router";
import { checkTokenBudget, recordTokenUsage } from "@/lib/ai-usage-tracker";
import { recordAIFailure, recordAISuccess } from "@/lib/ai-failure-monitor";
import { getOrCreateConversation, loadConversationHistory, saveMessage } from "@/lib/ai-conversation-memory";
import { getPromptVariant, recordVariantUsage } from "@/lib/ai-ab-testing";
import { evaluateResponse } from "@/lib/ai-quality-evaluator";
import { AI_TEMPERATURES } from "@/lib/ai-temperatures";

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

  const { context } = parsed.data;
  let { history } = parsed.data;

  // ── Multi-turn memory: load conversation history if no explicit history ───
  let activeConversationId: string | undefined;
  if (history.length === 0) {
    activeConversationId = await getOrCreateConversation(auth.tenantId, auth.username, "coach");
    const savedHistory = await loadConversationHistory(activeConversationId);
    if (savedHistory.length > 0) {
      history = savedHistory;
    }
  }

  // ── Prompt injection protection ─────────────────────────────────────────────
  const safetyCheck = processSafeInput(parsed.data.message);
  if (!safetyCheck.safe) {
    logger.warn("[ai-coach] Prompt injection blocked", { user: auth.username });
    return NextResponse.json({ response: safetyCheck.reason, mode: "blocked" as const });
  }
  const message = safetyCheck.input;
  const injectionCheck = detectPromptInjection(message);
  if (injectionCheck.severity === "medium") {
    logger.warn("[ai-coach] Possible injection attempt", { user: auth.username, pattern: injectionCheck.matchedPattern });
  }

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

  // ── Router LLM (ADR-010) hace disponibility check internamente ────────────
  // El fallback a rule-based se maneja en el bloque `!res.ok` más abajo.

  // ── Token budget check ──────────────────────────────────────────────────
  const budget = checkTokenBudget(auth.tenantId);
  if (!budget.allowed) {
    return NextResponse.json({
      response: budget.warning,
      mode: "budget-exceeded" as const,
      usage: { percentUsed: budget.percentUsed, limit: budget.limit },
      snapshot: snapshot.metrics,
    });
  }

  // ── Build messages for Groq (same pattern as ai-assistant/route.ts) ───────

  // ── A/B testing: select prompt variant ───────────────────────────────────
  const abVariant = getPromptVariant("coach-tone", auth.tenantId);
  const abModifier = abVariant ? `\n\nINSTRUCCIÓN ADICIONAL: ${abVariant.promptModifier}` : "";

  const messages = [
    { role: "system" as const, content: buildInjectionGuard() + "\n\n" + systemPrompt + abModifier },
    ...history.slice(-8).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user" as const, content: message },
  ];

  try {
    // Coach es "balanced" tier del router LLM (ADR-010) — usa
    // llama-3.3-70b-versatile por default, con fallback automático a
    // llama-4-scout si el primario cae. Temperatura del Gerente (Excel #7).
    const res = await callLLM("balanced", {
      messages,
      temperature: AI_TEMPERATURES.gerente,
      maxTokens: 1500,
      stream: true,
      label: "ai-coach",
    });

    if (!res.ok) {
      console.error("[ai-coach] LLM router error:", res.error);
      recordAIFailure("ai-coach", res.error ?? "unknown");
      return NextResponse.json({
        response: generateFallbackResponse(snapshot.metrics, fecha, temporada, feriadoStr),
        mode: "rule-based" as const,
        snapshot: snapshot.metrics,
      });
    }

    // ── Streaming response ──────────────────────────────────────────────────

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
    const data = res.data as Record<string, unknown>;
    const rawReply =
      ((data?.choices) as { message: { content: string } }[] | undefined)?.[0]?.message?.content ?? "No pude generar una respuesta.";

    const moderation = moderateLLMOutput(rawReply);
    if (!moderation.safe) {
      logger.warn("[ai-coach] Output moderation triggered", { violations: moderation.violations });
    }

    logger.info("[ai-coach] Token usage", { usage: res.usage, attempts: res.attempts });
    recordAISuccess("ai-coach");
    recordTokenUsage(auth.tenantId, res.usage?.totalTokens ?? 0);
    if (abVariant) recordVariantUsage("coach-tone", abVariant.id, { tokensUsed: res.usage?.totalTokens ?? 0 });

    // ── Auto quality evaluation ────────────────────────────────────────────
    const qualityScore = evaluateResponse(message, moderation.output, "coach");

    // ── Save to conversation memory (fire-and-forget) ─────────────────────
    if (activeConversationId) {
      saveMessage(activeConversationId, "user", message).catch(() => {});
      saveMessage(activeConversationId, "assistant", moderation.output, {
        mode: `coach-${context}`,
        tokensUsed: res.usage?.totalTokens ?? 0,
      }).catch(() => {});
    }

    return NextResponse.json({
      response: moderation.output,
      mode: "ai" as const,
      conversationId: activeConversationId,
      abVariant: abVariant?.id ?? null,
      tokensUsed: res.usage?.totalTokens ?? 0,
      budgetWarning: budget.warning,
      qualityScore: qualityScore.overall,
      snapshot: snapshot.metrics,
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[ai-coach] Fetch error:", errMsg);
    recordAIFailure("ai-coach", errMsg);
    return NextResponse.json({
      response: generateFallbackResponse(snapshot.metrics, fecha, temporada, feriadoStr),
      mode: "rule-based" as const,
      snapshot: snapshot.metrics,
    });
  }
}
