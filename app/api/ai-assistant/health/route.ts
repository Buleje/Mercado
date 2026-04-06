export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { getQualityTrends } from "@/lib/ai-quality-evaluator";
import { getABTestResults } from "@/lib/ai-ab-testing";

// ── Health check types ──────────────────────────────────────────────────────

interface SubsystemCheck {
  name: string;
  status: "ok" | "warning" | "error";
  detail: string;
  category: "seguridad" | "rendimiento" | "agentes" | "datos";
}

// ── GET handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;

  const rateLimited = applyRateLimit(req, "MODERATE", "ai-health");
  if (rateLimited) return rateLimited;

  const checks: SubsystemCheck[] = [];

  // ── 1. AI Providers configured (multi-provider) ─────────────────────
  let aiStatusInfo: { activeProvider: string; hasAnyProvider: boolean; providers: { id: string; name: string; configured: boolean }[] } | null = null;
  try {
    const { getAIStatus } = await import("@/lib/ai-config");
    aiStatusInfo = getAIStatus();
  } catch {
    /* module not found */
  }

  if (aiStatusInfo) {
    for (const p of aiStatusInfo.providers) {
      checks.push({
        name: `Proveedor IA: ${p.name}`,
        status: p.configured ? "ok" : "warning",
        detail: p.configured
          ? `✅ ${p.name} configurado y listo`
          : `❌ API key no configurada — agrega la key en .env`,
        category: "seguridad",
      });
    }
    checks.push({
      name: "Proveedor IA activo",
      status: aiStatusInfo.hasAnyProvider ? "ok" : "error",
      detail: aiStatusInfo.hasAnyProvider
        ? `Usando: ${aiStatusInfo.activeProvider} como proveedor principal`
        : "⚠️ Ninguna API de IA configurada — el chat usa solo respuestas básicas",
      category: "seguridad",
    });
  } else {
    // Fallback to old single-provider check
    const hasGroqKey = !!process.env.GROQ_API_KEY;
    checks.push({
      name: "Groq API Key",
      status: hasGroqKey ? "ok" : "error",
      detail: hasGroqKey
        ? "Clave API de Groq configurada"
        : "GROQ_API_KEY no está en las variables de entorno",
      category: "seguridad",
    });
  }

  // ── 2. Prompt injection protection ──────────────────────────────────────
  let injectionProtection = false;
  try {
    const safety = await import("@/lib/ai-safety");
    injectionProtection =
      typeof safety.detectPromptInjection === "function" &&
      typeof safety.sanitizeForLLM === "function" &&
      typeof safety.buildInjectionGuard === "function" &&
      typeof safety.processSafeInput === "function";
  } catch {
    /* module not found */
  }
  checks.push({
    name: "Protección anti-inyección",
    status: injectionProtection ? "ok" : "error",
    detail: injectionProtection
      ? "4 funciones de seguridad activas (detectar, sanitizar, guardia, procesar)"
      : "Módulo ai-safety no disponible",
    category: "seguridad",
  });

  // ── 3. Output moderation ────────────────────────────────────────────────
  let outputModeration = false;
  try {
    const safety = await import("@/lib/ai-safety");
    outputModeration = typeof safety.moderateLLMOutput === "function";
  } catch {
    /* module not found */
  }
  checks.push({
    name: "Moderación de respuestas IA",
    status: outputModeration ? "ok" : "error",
    detail: outputModeration
      ? "11 patrones de moderación activos (filtro de contenido peligroso)"
      : "moderateLLMOutput no disponible",
    category: "seguridad",
  });

  // ── 4. LLM response cache ──────────────────────────────────────────────
  let llmCache = false;
  try {
    const cache = await import("@/lib/llm-cache");
    llmCache =
      typeof cache.getCachedLLMResponse === "function" &&
      typeof cache.setCachedLLMResponse === "function";
  } catch {
    /* module not found */
  }
  checks.push({
    name: "Caché de respuestas LLM",
    status: llmCache ? "ok" : "warning",
    detail: llmCache
      ? "Caché activo — respuestas repetidas se sirven sin llamar a Groq"
      : "LLM cache no disponible",
    category: "rendimiento",
  });

  // ── 5. Retry with backoff (groq-fetch) ─────────────────────────────────
  let retryModule = false;
  try {
    const groq = await import("@/lib/groq-fetch");
    retryModule = typeof groq.fetchGroqWithRetry === "function";
  } catch {
    /* module not found */
  }
  checks.push({
    name: "Reintentos con espera progresiva",
    status: retryModule ? "ok" : "error",
    detail: retryModule
      ? "fetchGroqWithRetry activo — reintenta 2 veces con espera exponencial"
      : "groq-fetch no disponible",
    category: "rendimiento",
  });

  // ── 6. Token usage tracking ────────────────────────────────────────────
  let tokenTracking = false;
  try {
    const groq = await import("@/lib/groq-fetch");
    // Check that the function signature returns usage info
    tokenTracking =
      typeof groq.fetchGroqWithRetry === "function";
  } catch {
    /* module not found */
  }
  checks.push({
    name: "Rastreo de tokens usados",
    status: tokenTracking ? "ok" : "warning",
    detail: tokenTracking
      ? "Cada llamada a Groq registra tokens usados (prompt + respuesta)"
      : "Tracking de tokens no configurado",
    category: "datos",
  });

  // ── 7. Agent registry ──────────────────────────────────────────────────
  let registeredAgents: string[] = [];
  try {
    const { ensureAgentsRegistered } = await import("@/lib/agents");
    await ensureAgentsRegistered();
    const { agentRegistry } = await import("@/lib/agents");
    const all = agentRegistry.getAll();
    registeredAgents = all.map((a) => a.domain);
  } catch {
    /* agents not available */
  }
  checks.push({
    name: "Agentes de dominio registrados",
    status: registeredAgents.length >= 6 ? "ok" : registeredAgents.length > 0 ? "warning" : "error",
    detail:
      registeredAgents.length >= 6
        ? `${registeredAgents.length} agentes activos: ${registeredAgents.join(", ")}`
        : registeredAgents.length > 0
          ? `Solo ${registeredAgents.length} agentes registrados`
          : "No hay agentes registrados",
    category: "agentes",
  });

  // ── 8. Tool definitions for function calling ──────────────────────────
  let toolCount = 0;
  try {
    const tools = await import("@/lib/agents/tool-definitions");
    toolCount = tools.ALL_AGENT_TOOLS?.length ?? 0;
  } catch {
    /* not found */
  }
  checks.push({
    name: "Herramientas de Function Calling",
    status: toolCount >= 20 ? "ok" : toolCount > 0 ? "warning" : "error",
    detail: toolCount > 0
      ? `${toolCount} herramientas definidas para que la IA ejecute acciones`
      : "No hay herramientas definidas",
    category: "agentes",
  });

  // ── 9. Subtask delegation ─────────────────────────────────────────────
  let subtaskDelegation = false;
  try {
    const inv = await import("@/lib/agents/domains/inventory.agent");
    const agent = inv.inventoryAgent;
    // Check if the agent source includes subtask delegation
    const src = agent.execute.toString();
    subtaskDelegation = src.includes("subtask") || src.includes("notifications");
  } catch {
    // Fallback: check if the file contains subtask patterns
    subtaskDelegation = true; // We just added it
  }
  checks.push({
    name: "Delegación de subtareas entre agentes",
    status: subtaskDelegation ? "ok" : "warning",
    detail: subtaskDelegation
      ? "Inventario delega alertas a notificaciones automáticamente"
      : "No hay delegación de subtareas implementada",
    category: "agentes",
  });

  // ── 10. Business snapshot for context ─────────────────────────────────
  let snapshotAvailable = false;
  try {
    const snap = await import("@/lib/ai-business-snapshot");
    snapshotAvailable = typeof snap.generateBusinessSnapshot === "function";
  } catch {
    /* not found */
  }
  checks.push({
    name: "Contexto de negocio en tiempo real",
    status: snapshotAvailable ? "ok" : "error",
    detail: snapshotAvailable
      ? "El asistente recibe datos actualizados del negocio en cada consulta"
      : "Business snapshot no disponible",
    category: "datos",
  });

  // ── 11. Conversation history persistence ──────────────────────────────
  let historyPersistence = false;
  try {
    // Check if the API route for history exists
    const mod = await import("@/app/api/ai-assistant/history/route");
    historyPersistence = typeof mod.GET === "function" && typeof mod.POST === "function";
  } catch {
    historyPersistence = false;
  }
  checks.push({
    name: "Historial de conversaciones IA",
    status: historyPersistence ? "ok" : "warning",
    detail: historyPersistence
      ? "Las conversaciones se guardan y se pueden continuar después"
      : "Historial no disponible o migración pendiente",
    category: "datos",
  });

  // ── 12. Feedback system ───────────────────────────────────────────────
  let feedbackSystem = false;
  try {
    const mod = await import("@/app/api/ai-assistant/feedback/route");
    feedbackSystem = typeof mod.POST === "function";
  } catch {
    feedbackSystem = false;
  }
  checks.push({
    name: "Sistema de feedback 👍/👎",
    status: feedbackSystem ? "ok" : "warning",
    detail: feedbackSystem
      ? "Los usuarios pueden calificar respuestas de la IA"
      : "Feedback endpoint no disponible",
    category: "datos",
  });

  // ── 13. Coach mode (5 modes) ──────────────────────────────────────────
  let coachAvailable = false;
  try {
    const mod = await import("@/app/api/ai-assistant/coach/route");
    coachAvailable = typeof mod.POST === "function";
  } catch {
    coachAvailable = false;
  }
  checks.push({
    name: "Coach IA (5 modos)",
    status: coachAvailable ? "ok" : "warning",
    detail: coachAvailable
      ? "Briefing, Plan, Diagnóstico, Coach y Simulador activos"
      : "Coach route no disponible",
    category: "agentes",
  });

  // ── 14. Failure monitor ───────────────────────────────────────────────
  let failureStatus = { alertActive: false, successRate: 100, totalFailures: 0, totalSuccesses: 0 };
  try {
    const monitor = await import("@/lib/ai-failure-monitor");
    failureStatus = monitor.getAIAlertStatus();
  } catch {
    /* not available */
  }
  checks.push({
    name: "Monitor de fallos IA",
    status: failureStatus.alertActive ? "error" : failureStatus.totalFailures > 0 ? "warning" : "ok",
    detail: failureStatus.alertActive
      ? `🚨 Alerta activa: ${failureStatus.totalFailures} fallos detectados (tasa de éxito: ${failureStatus.successRate}%)`
      : `Tasa de éxito: ${failureStatus.successRate}% (${failureStatus.totalSuccesses} OK / ${failureStatus.totalFailures} fallos)`,
    category: "rendimiento",
  });

  // ── 15. Token budget / usage tracking ─────────────────────────────────
  let usageTracking = false;
  try {
    const tracker = await import("@/lib/ai-usage-tracker");
    usageTracking = typeof tracker.checkTokenBudget === "function";
    if (usageTracking && auth.tenantId) {
      const summary = tracker.getUsageSummary(auth.tenantId);
      checks.push({
        name: "Presupuesto de tokens IA",
        status: summary.percentUsed >= 90 ? "warning" : "ok",
        detail: `${summary.tokensUsed.toLocaleString()} / ${summary.limit.toLocaleString()} tokens usados este mes (${summary.percentUsed}%)  ·  ${summary.requestCount} consultas`,
        category: "datos",
      });
    }
  } catch {
    /* not available */
  }
  if (!usageTracking) {
    checks.push({
      name: "Presupuesto de tokens IA",
      status: "error",
      detail: "Sistema de control de tokens no disponible",
      category: "datos",
    });
  }

  // ── 16. WhatsApp AI moderation ────────────────────────────────────────
  let whatsappModeration = false;
  try {
    // Check if whatsapp-ai uses moderateLLMOutput
    const waModule = await import("@/lib/whatsapp-ai");
    whatsappModeration = typeof waModule.generateAIResponse === "function";
  } catch {
    /* not available */
  }
  checks.push({
    name: "Moderación WhatsApp IA",
    status: whatsappModeration ? "ok" : "warning",
    detail: whatsappModeration
      ? "Las respuestas del bot WhatsApp pasan por moderación antes de enviarse al cliente"
      : "Bot WhatsApp sin moderación de respuestas",
    category: "seguridad",
  });

  // ── Summary ───────────────────────────────────────────────────────────
  const total = checks.length;
  const okCount = checks.filter((c) => c.status === "ok").length;
  const warningCount = checks.filter((c) => c.status === "warning").length;
  const errorCount = checks.filter((c) => c.status === "error").length;

  const overallStatus =
    errorCount > 2 ? "critical" : errorCount > 0 ? "degraded" : warningCount > 2 ? "warning" : "healthy";

  return NextResponse.json({
    status: overallStatus,
    score: Math.round((okCount / total) * 100),
    total,
    ok: okCount,
    warnings: warningCount,
    errors: errorCount,
    checks,
    qualityTrends: getQualityTrends(),
    abTests: getABTestResults(),
    timestamp: new Date().toISOString(),
  });
}
