export const dynamic = 'force-dynamic'
import { NextResponse, type NextRequest } from "next/server";
import { ProductsDB, OrdersDB, CustomersDB, SalesDB, PayablesDB, PurchasesDB, ReviewsDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { processSafeInput, buildInjectionGuard, detectPromptInjection, moderateLLMOutput } from "@/lib/ai-safety";
import { getCachedLLMResponse, setCachedLLMResponse } from "@/lib/llm-cache";
import { ALL_AGENT_TOOLS, resolveToolCall, isToolApprovalRequired } from "@/lib/agents/tool-definitions";
import { orchestrator, ensureAgentsRegistered } from "@/lib/agents";
import { stashPendingApproval } from "@/lib/agents/pending-approvals";
import { fetchGroqWithRetry, type GroqUsage } from "@/lib/groq-fetch";
import { checkTokenBudget, recordTokenUsage } from "@/lib/ai-usage-tracker";
import { recordAIFailure, recordAISuccess } from "@/lib/ai-failure-monitor";
import { getOrCreateConversation, loadConversationHistory, saveMessage } from "@/lib/ai-conversation-memory";
import { getPromptVariant, recordVariantUsage } from "@/lib/ai-ab-testing";
import { evaluateResponse } from "@/lib/ai-quality-evaluator";
import { AI_TEMPERATURES } from "@/lib/ai-temperatures";

// ── Snapshot cache (5 min TTL) ────────────────────────────────────────────────

let cachedSnapshot: { text: string; metrics: Record<string, unknown>; ts: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getBusinessSnapshot(tenantId: string) {
  const now = Date.now();
  if (cachedSnapshot && now - cachedSnapshot.ts < CACHE_TTL) return cachedSnapshot;

  const [products, orders, customers, sales, payables, purchases, reviews] = await Promise.all([
    ProductsDB.getAll(tenantId), OrdersDB.getAll(tenantId), CustomersDB.getAll(tenantId),
    SalesDB.getAll(tenantId), PayablesDB.getAll(tenantId), PurchasesDB.getAll(tenantId), ReviewsDB.getAll(tenantId),
  ]);

  const d = new Date();
  const today = d.toISOString().slice(0, 10);
  const weekAgo = new Date(d.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
  const monthAgo = new Date(d.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);

  const activeProducts = products.filter(p => p.active);
  const outOfStock = activeProducts.filter(p => (p.stock ?? 0) === 0);
  const lowStock = activeProducts.filter(p => p.stock != null && p.stockMin != null && p.stock > 0 && p.stock <= p.stockMin);

  const validOrders = orders.filter(o => o.status !== "cancelado");
  const todayOrders = validOrders.filter(o => o.createdAt?.slice(0, 10) === today);
  const weekOrders = validOrders.filter(o => (o.createdAt?.slice(0, 10) ?? "") >= weekAgo);
  const monthOrders = validOrders.filter(o => (o.createdAt?.slice(0, 10) ?? "") >= monthAgo);

  const todaySales = sales.filter(s => s.createdAt?.slice(0, 10) === today);
  const weekSales = sales.filter(s => (s.createdAt?.slice(0, 10) ?? "") >= weekAgo);

  const todayRevenue = todayOrders.reduce((s, o) => s + o.total, 0) + todaySales.reduce((s, sl) => s + sl.total, 0);
  const weekRevenue = weekOrders.reduce((s, o) => s + o.total, 0) + weekSales.reduce((s, sl) => s + sl.total, 0);
  const monthRevenue = monthOrders.reduce((s, o) => s + o.total, 0) + sales.filter(s => (s.createdAt?.slice(0, 10) ?? "") >= monthAgo).reduce((s, sl) => s + sl.total, 0);

  const pendingOrders = orders.filter(o => o.status === "pendiente").length;
  const cancelledMonth = orders.filter(o => o.status === "cancelado" && (o.createdAt?.slice(0, 10) ?? "") >= monthAgo).length;

  const costMap: Record<string, number> = {};
  products.forEach(p => { if (p.costPrice) costMap[p.id] = p.costPrice; });
  const monthCost = [...monthOrders.flatMap(o => o.items), ...sales.filter(s => (s.createdAt?.slice(0, 10) ?? "") >= monthAgo).flatMap(s => s.items)]
    .reduce((s, i) => s + (costMap["id" in i ? i.id : i.productId] ?? 0) * i.quantity, 0);
  const monthProfit = monthRevenue - monthCost;
  const margin = monthRevenue > 0 ? ((monthProfit / monthRevenue) * 100).toFixed(1) : "0";

  const prodRevenue: Record<string, { name: string; qty: number; rev: number }> = {};
  for (const o of monthOrders) for (const i of o.items) {
    if (!prodRevenue[i.id]) prodRevenue[i.id] = { name: i.name, qty: 0, rev: 0 };
    prodRevenue[i.id].qty += i.quantity; prodRevenue[i.id].rev += i.price * i.quantity;
  }
  const top10 = Object.values(prodRevenue).sort((a, b) => b.rev - a.rev).slice(0, 10);

  const spendMap = new Map<string, number>();
  validOrders.forEach(o => { if (o.customer?.phone) spendMap.set(o.customer.phone, (spendMap.get(o.customer.phone) ?? 0) + o.total); });
  const topCustomers = [...spendMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const avgRating = reviews.length > 0 ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : "N/A";

  const pendingPayables = payables.filter(p => p.status !== "pagado");
  const totalDebt = pendingPayables.reduce((s, p) => s + (p.amount - p.paidAmount), 0);
  const overdueCount = pendingPayables.filter(p => new Date(p.dueDate) < d).length;

  const text = `
SNAPSHOT DEL NEGOCIO (${today}):

VENTAS:
- Ingresos hoy: S/${todayRevenue.toFixed(2)} (${todayOrders.length + todaySales.length} transacciones)
- Ingresos semana: S/${weekRevenue.toFixed(2)} (${weekOrders.length + weekSales.length} transacciones)
- Ingresos mes: S/${monthRevenue.toFixed(2)} (${monthOrders.length} pedidos + ventas directas)
- Utilidad mes: S/${monthProfit.toFixed(2)} (Margen: ${margin}%)
- Cancelados este mes: ${cancelledMonth}

PEDIDOS:
- Pendientes: ${pendingOrders}
- Total activos: ${validOrders.length}

INVENTARIO:
- Productos activos: ${activeProducts.length}
- Agotados: ${outOfStock.length}${outOfStock.length > 0 ? " → " + outOfStock.slice(0, 5).map(p => p.name).join(", ") : ""}
- Stock crítico: ${lowStock.length}${lowStock.length > 0 ? " → " + lowStock.slice(0, 5).map(p => `${p.name}(${p.stock}/${p.stockMin})`).join(", ") : ""}

TOP 10 PRODUCTOS (30 días):
${top10.map((p, i) => `${i + 1}. ${p.name}: ${p.qty} uds, S/${p.rev.toFixed(2)}`).join("\n")}

CLIENTES:
- Total registrados: ${customers.length}
- Rating promedio: ${avgRating}★ (${reviews.length} reseñas)
- Top 5 clientes: ${topCustomers.map(([ph, spent]) => { const c = customers.find(x => x.phone === ph); return `${c?.name ?? ph}: S/${spent.toFixed(2)}`; }).join(" | ")}

CUENTAS POR PAGAR:
- Deuda total: S/${totalDebt.toFixed(2)}
- Facturas vencidas: ${overdueCount}
- Facturas pendientes: ${pendingPayables.length}

COMPRAS:
- Total compras registradas: ${purchases.length}
`.trim();

  const metrics: Record<string, unknown> = {
    todayRevenue: +todayRevenue.toFixed(2),
    weekRevenue: +weekRevenue.toFixed(2),
    monthRevenue: +monthRevenue.toFixed(2),
    monthProfit: +monthProfit.toFixed(2),
    margin,
    pendingOrders,
    outOfStockCount: outOfStock.length,
    lowStockCount: lowStock.length,
    activeProducts: activeProducts.length,
    totalCustomers: customers.length,
    avgRating,
    pendingPayables: pendingPayables.length,
    totalDebt: +totalDebt.toFixed(2),
    overdueCount,
    topProductName: top10[0]?.name ?? "N/A",
  };
  cachedSnapshot = { text, metrics, ts: now };
  return cachedSnapshot;
}

const SYSTEM_PROMPT_TEMPLATE = (snapshot: string) => `Eres el Asistente Ejecutivo IA de "Buleje", una tienda de abarrotes premium en Pucallpa, Perú.

PERSONALIDAD:
- Profesional, directo, estratégico — como un gerente general millonario que domina retail y ventas
- Hablas en español, con tono ejecutivo pero cercano
- Siempre das recomendaciones accionables y priorizadas
- Usas datos reales del negocio para respaldar cada consejo
- Formato conciso: bullets, negritas, números — no párrafos largos

CAPACIDADES:
1. ANÁLISIS: Diagnosticar la situación actual del negocio basándote en los datos reales
2. PRIORIZACIÓN: Decir qué hacer AHORA vs qué puede esperar, ordenado por impacto
3. ALERTAS: Detectar problemas urgentes (stock agotado, pedidos sin atender, deuda vencida)
4. ESTRATEGIA: Sugerir acciones de marketing, pricing, inventario, retención de clientes
5. PRODUCTOS: Ayudar a decidir qué productos agregar, cuáles quitar, cómo fijar precios
6. MÓDULOS: Guiar a qué módulo del panel admin ir para resolver cada tarea
7. TAREAS: Crear listas de acción priorizadas con responsable y plazo sugerido

DATOS EN TIEMPO REAL DEL NEGOCIO:
${snapshot}

MÓDULOS DISPONIBLES EN EL PANEL ADMIN:
- panel-principal: Dashboard general con KPIs y gráficos
- pos-caja: Punto de venta / caja registradora
- inventario-almacenes: Gestión de stock y almacenes
- reposicion: Reposición automática de inventario
- pedidos: Gestión detallada de pedidos
- catalogo-tienda: Catálogo de productos y tienda
- precios-promos: Precios, descuentos y promociones
- compras: Gestión de compras a proveedores
- proveedores: Directorio de proveedores
- clientes: Lista de clientes
- crm-clientes: CRM avanzado con segmentación
- ventas-marketing: Campañas y marketing
- fidelizacion: Programas de lealtad
- analytics-bi: Analítica avanzada e inteligencia de negocio
- proyecciones: Proyecciones de demanda
- finanzas: Resumen financiero
- tesoreria: Flujo de caja
- facturacion: Facturación electrónica
- gastos-activos: Control de gastos
- reportes-documentos: Reportes y documentos
- alertas-automatizacion: Alertas y automatización

REGLAS:
- Siempre basa tus respuestas en los datos reales proporcionados
- Si no sabes algo, di "no tengo esa información" en vez de inventar
- Prioriza siempre: dinero > clientes > inventario > operaciones
- Cuando sugieras ir a un módulo, indica el nombre exacto entre comillas
- Responde en formato Markdown para que sea legible
- Sé conciso: máximo 300 palabras por respuesta

ACCIONES EJECUTABLES:
Puedes sugerir acciones que el usuario puede ejecutar directamente desde el chat.
Cuando propongas una acción, usa EXACTAMENTE este formato en una línea propia:

[ACTION:tipo_accion|{"campo":"valor"}|Descripción para el usuario]

Tipos de acción disponibles:
- update_price: {"productId":1,"newPrice":5.50} — Cambiar precio de producto
- update_stock: {"productId":1,"newStock":100} — Ajustar stock
- toggle_product: {"productId":1,"active":false} — Activar/desactivar producto
- create_product: {"name":"X","category":"Y","price":Z,"unit":"unidad","stock":0,"stockMin":5} — Crear producto nuevo
- update_order_status: {"orderId":"abc","status":"confirmado"} — Cambiar estado de pedido

Solo sugiere acciones cuando el usuario pida explícitamente hacer algo (crear, cambiar, activar, etc).
Máximo 3 acciones por mensaje.

HERRAMIENTAS DE DATOS:
Tienes acceso a herramientas (tools/functions) que puedes llamar para obtener datos en tiempo real del negocio.
Úsalas cuando necesites información más detallada que el snapshot inicial.
Por ejemplo: para ver segmentación de clientes, auditar vencimientos, analizar márgenes por producto, ver tendencias, etc.
Las herramientas te devuelven datos reales de la base de datos — úsalos para dar respuestas precisas.`;

// ── Rule-based fallback (no AI needed) ──────────────────────────────────────

function generateRuleBasedResponse(query: string, metrics: Record<string, unknown>): string {
  const q = query.toLowerCase();

  if (q.includes("venta") && (q.includes("hoy") || q.includes("dia")))
    return `Ventas de hoy: S/ ${metrics.todayRevenue ?? 0}. Tienes ${metrics.pendingOrders ?? 0} pedidos pendientes.`;

  if (q.includes("stock") || q.includes("inventario"))
    return `Tienes ${metrics.outOfStockCount ?? 0} productos agotados y ${metrics.lowStockCount ?? 0} con stock bajo. Productos activos: ${metrics.activeProducts ?? 0}.`;

  if (q.includes("debe") || q.includes("deuda") || q.includes("fiao"))
    return `Deuda total: S/ ${metrics.totalDebt ?? 0}. Tienes ${metrics.pendingPayables ?? 0} pagos pendientes a proveedores y ${metrics.overdueCount ?? 0} facturas vencidas.`;

  if (q.includes("pedido"))
    return `Hay ${metrics.pendingOrders ?? 0} pedidos pendientes. Ventas de hoy: S/ ${metrics.todayRevenue ?? 0}.`;

  if (q.includes("cliente"))
    return `Tienes ${metrics.totalCustomers ?? 0} clientes registrados. Rating promedio: ${metrics.avgRating ?? "N/A"}.`;

  if (q.includes("producto") && q.includes("vend"))
    return `Top producto: ${metrics.topProductName ?? "N/A"}. Productos activos: ${metrics.activeProducts ?? 0}.`;

  if (q.includes("ganancia") || q.includes("utilidad") || q.includes("margen"))
    return `Utilidad del mes: S/ ${metrics.monthProfit ?? 0}. Margen: ${metrics.margin ?? 0}%. Ingresos del mes: S/ ${metrics.monthRevenue ?? 0}.`;

  // Default: business summary
  return `Resumen: Ventas hoy S/ ${metrics.todayRevenue ?? 0}, ${metrics.pendingOrders ?? 0} pedidos pendientes, ${metrics.outOfStockCount ?? 0} sin stock, ${metrics.lowStockCount ?? 0} stock bajo. Deuda: S/ ${metrics.totalDebt ?? 0}.`;
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  // ── Rate limiting: 15 requests / 5 min per IP ──────────────────────────────
  const rateLimited = applyRateLimit(req, "MODERATE", "ai-assistant");
  if (rateLimited) return rateLimited;

  const body = await req.json().catch(() => ({ message: "", history: [] }));
  const rawMessage = (body.message ?? "").trim();
  let history: { role: string; content: string }[] = body.history ?? [];
  const wantStream = body.stream !== false; // default: stream
  const conversationId = body.conversationId as string | undefined;

  if (!rawMessage) {
    return NextResponse.json({ error: "Mensaje requerido" }, { status: 400 });
  }

  // ── Prompt injection protection ─────────────────────────────────────────────
  const safetyCheck = processSafeInput(rawMessage);
  if (!safetyCheck.safe) {
    logger.warn("[ai-assistant] Prompt injection blocked", { user: auth.username });
    return NextResponse.json({ response: safetyCheck.reason, mode: "blocked" as const });
  }
  const userMessage = safetyCheck.input;
  const injectionCheck = detectPromptInjection(userMessage);
  if (injectionCheck.severity === "medium") {
    logger.warn("[ai-assistant] Possible injection attempt", { user: auth.username, pattern: injectionCheck.matchedPattern });
  }

  // ── Build snapshot (cached 5 min) ───────────────────────────────────────────
  const snapshot = await getBusinessSnapshot(auth.tenantId);

  // ── Helper: return rule-based fallback (always 200) ────────────────────────
  const returnRuleBased = () => {
    const response = generateRuleBasedResponse(userMessage, snapshot.metrics);
    return NextResponse.json({
      response,
      mode: "rule-based" as const,
      snapshot: snapshot.metrics,
    });
  };

  // ── If no API key, use rule-based immediately ─────────────────────────────
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    logger.warn("[ai-assistant] GROQ_API_KEY not configured — using rule-based fallback");
    return returnRuleBased();
  }

  // ── Token budget check — prevent overspending on AI ──────────────────────
  const budget = checkTokenBudget(auth.tenantId);
  if (!budget.allowed) {
    return NextResponse.json({
      response: budget.warning,
      mode: "budget-exceeded" as const,
      usage: { percentUsed: budget.percentUsed, limit: budget.limit },
      snapshot: snapshot.metrics,
    });
  }

  // ── LLM response cache (skip if streaming or has history context) ────────
  const isSimpleQuery = history.length === 0 && !conversationId;

  // ── Multi-turn memory: load conversation history if no explicit history ───
  let activeConversationId: string | undefined;
  if (history.length === 0) {
    activeConversationId = conversationId
      ?? await getOrCreateConversation(auth.tenantId, auth.username, "assistant");
    const savedHistory = await loadConversationHistory(activeConversationId);
    if (savedHistory.length > 0) {
      history = savedHistory;
    }
  }

  if (isSimpleQuery) {
    const cached = getCachedLLMResponse(auth.tenantId, "assistant", userMessage);
    if (cached) {
      return NextResponse.json({
        response: cached.response,
        mode: "ai" as const,
        cached: true,
        snapshot: snapshot.metrics,
      });
    }
  }
  // ── A/B testing: select prompt variant ───────────────────────────────────
  const abVariant = getPromptVariant("assistant-detail", auth.tenantId);
  const abModifier = abVariant ? `\n\nINSTRUCCIÓN ADICIONAL: ${abVariant.promptModifier}` : "";

  const messages: { role: "system" | "user" | "assistant" | "tool"; content: string; tool_call_id?: string }[] = [
    { role: "system" as const, content: buildInjectionGuard() + "\n\n" + SYSTEM_PROMPT_TEMPLATE(snapshot.text) + abModifier },
    ...history.slice(-8).map(m => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user" as const, content: userMessage },
  ];

  // ── Ensure domain agents are registered for function calling ──────────────
  await ensureAgentsRegistered();

  try {
    // ── First LLM call (with tools) ─────────────────────────────────────────
    const groqPayload: Record<string, unknown> = {
      model: "llama-3.3-70b-versatile",
      messages,
      temperature: AI_TEMPERATURES.router,
      max_tokens: 1500,
      stream: false, // Function calling requires non-streaming first pass
      tools: ALL_AGENT_TOOLS,
      tool_choice: "auto",
    };

    let totalUsage: GroqUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

    const res = await fetchGroqWithRetry(apiKey, groqPayload, "ai-assistant");

    if (!res.ok) {
      console.error("[ai-assistant] Groq API error:", res.error);
      recordAIFailure("ai-assistant", res.error ?? "unknown");
      return returnRuleBased();
    }

    if (res.usage) {
      totalUsage = { ...res.usage };
    }

    const data = res.data!;
    const choice = (data.choices as { message: Record<string, unknown> }[])?.[0];
    const assistantMessage = choice?.message;

    // ── Handle tool calls from the LLM ──────────────────────────────────────
    if (assistantMessage?.tool_calls && assistantMessage.tool_calls.length > 0) {
      logger.info("[ai-assistant] LLM requested tool calls", {
        count: assistantMessage.tool_calls.length,
        tools: assistantMessage.tool_calls.map((tc: { function: { name: string } }) => tc.function.name),
      });

      // If streaming, pipe tool progress + final response as SSE
      if (wantStream) {
        const encoder = new TextEncoder();
        const capturedMessages = [...messages];

        // Add the assistant's tool_calls message
        capturedMessages.push({
          role: "assistant" as const,
          content: assistantMessage.content ?? "",
          ...({ tool_calls: assistantMessage.tool_calls } as Record<string, unknown>),
        });

        const toolCalls = assistantMessage.tool_calls.slice(0, 5);

        const stream = new ReadableStream({
          async start(controller) {
            try {
              // Execute tools with progress events
              for (const toolCall of toolCalls) {
                const toolName = toolCall.function?.name;

                // Send progress event
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ toolProgress: getToolLabel(toolName), tool: toolName })}\n\n`)
                );

                const mapping = resolveToolCall(toolName);
                let toolResult: string;

                if (!mapping) {
                  toolResult = JSON.stringify({ error: `Herramienta "${toolName}" no reconocida` });
                } else {
                  let args: Record<string, unknown> = {};
                  try { args = JSON.parse(toolCall.function.arguments || "{}"); } catch { args = {}; }

                  // ── HITL gate (Excel Agentes IA práctica #10, TD-025) ──
                  if (isToolApprovalRequired(toolName)) {
                    const approvalId = stashPendingApproval({
                      tenantId: auth.tenantId,
                      toolName,
                      domain: mapping.domain,
                      action: mapping.action,
                      payload: args,
                      conversationId: activeConversationId,
                      requestedBy: auth.username,
                    });
                    toolResult = JSON.stringify({
                      pendingApprovalId: approvalId,
                      requiresApproval: true,
                      message: `Acción "${toolName}" pendiente de aprobación humana. Un admin debe confirmarla antes de ejecutar.`,
                    });
                  } else {
                    const result = await orchestrator.executeSync({
                      domain: mapping.domain,
                      action: mapping.action,
                      payload: args,
                      tenantId: auth.tenantId,
                    });
                    toolResult = JSON.stringify(result.success ? result.data : { error: result.error });
                  }
                }

                capturedMessages.push({
                  role: "tool" as const,
                  content: toolResult,
                  tool_call_id: toolCall.id,
                });
              }

              // Send "generating response" progress
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ toolProgress: "Generando respuesta...", tool: "_final" })}\n\n`)
              );

              // Second LLM call — stream the response
              const followUpRes = await fetchGroqWithRetry(apiKey, {
                model: "llama-3.3-70b-versatile",
                messages: capturedMessages,
                temperature: AI_TEMPERATURES.toolFollowup,
                max_tokens: 1500,
                stream: true,
              }, "ai-assistant-followup");

              if (!followUpRes.ok || !followUpRes.body) {
                recordAIFailure("ai-assistant-followup", followUpRes.error ?? "unknown");
                const fallback = generateRuleBasedResponse(userMessage, snapshot.metrics);
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: fallback })}\n\n`));
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                controller.close();
                return;
              }

              recordAISuccess("ai-assistant");
              if (followUpRes.usage) {
                totalUsage.promptTokens += followUpRes.usage.promptTokens;
                totalUsage.completionTokens += followUpRes.usage.completionTokens;
                totalUsage.totalTokens += followUpRes.usage.totalTokens;
                recordTokenUsage(auth.tenantId, followUpRes.usage.totalTokens);
              }

              // Pipe the Groq stream through
              const reader = followUpRes.body.getReader();
              const decoder = new TextDecoder();
              let buffer = "";

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
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
                    }
                  } catch { /* skip */ }
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

      // ── Non-streaming tool call path ──────────────────────────────────────

      // Add the assistant's tool_calls message to conversation
      messages.push({
        role: "assistant" as const,
        content: assistantMessage.content ?? "",
        ...({ tool_calls: assistantMessage.tool_calls } as Record<string, unknown>),
      });

      // Execute each tool call via the orchestrator
      const MAX_TOOL_CALLS = 5; // safety limit
      const toolCalls = assistantMessage.tool_calls.slice(0, MAX_TOOL_CALLS);

      for (const toolCall of toolCalls) {
        const toolName = toolCall.function?.name;
        const mapping = resolveToolCall(toolName);

        let toolResult: string;

        if (!mapping) {
          toolResult = JSON.stringify({ error: `Herramienta "${toolName}" no reconocida` });
        } else {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(toolCall.function.arguments || "{}");
          } catch {
            args = {};
          }

          // ── HITL gate (Excel Agentes IA práctica #10, TD-025) ──
          if (isToolApprovalRequired(toolName)) {
            const approvalId = stashPendingApproval({
              tenantId: auth.tenantId,
              toolName,
              domain: mapping.domain,
              action: mapping.action,
              payload: args,
              conversationId: activeConversationId,
              requestedBy: auth.username,
            });
            toolResult = JSON.stringify({
              pendingApprovalId: approvalId,
              requiresApproval: true,
              message: `Acción "${toolName}" pendiente de aprobación humana. Un admin debe confirmarla antes de ejecutar.`,
            });
          } else {
            const result = await orchestrator.executeSync({
              domain: mapping.domain,
              action: mapping.action,
              payload: args,
              tenantId: auth.tenantId,
            });

            toolResult = JSON.stringify(
              result.success ? result.data : { error: result.error },
            );
          }
        }

        // Add tool result to the conversation
        messages.push({
          role: "tool" as const,
          content: toolResult,
          tool_call_id: toolCall.id,
        });
      }

      // ── Second LLM call with tool results ─────────────────────────────────
      const followUpRes = await fetchGroqWithRetry(apiKey, {
        model: "llama-3.3-70b-versatile",
        messages,
        temperature: AI_TEMPERATURES.toolFollowup,
        max_tokens: 1500,
        stream: wantStream,
      }, "ai-assistant-followup");

      if (!followUpRes.ok) {
        console.error("[ai-assistant] Groq follow-up error:", followUpRes.error);
        recordAIFailure("ai-assistant-followup", followUpRes.error ?? "unknown");
        return returnRuleBased();
      }

      if (followUpRes.usage) {
        totalUsage.promptTokens += followUpRes.usage.promptTokens;
        totalUsage.completionTokens += followUpRes.usage.completionTokens;
        totalUsage.totalTokens += followUpRes.usage.totalTokens;
      }

      // ── Stream the follow-up response if requested ──────────────────────
      if (wantStream && followUpRes.body) {
        return streamGroqResponse(followUpRes.body);
      }

      const followUpData = followUpRes.data!;
      const rawReply = (followUpData.choices as { message: { content: string } }[])?.[0]?.message?.content ?? "No pude generar una respuesta.";

      // ── Output moderation ───────────────────────────────────────────────
      const moderation = moderateLLMOutput(rawReply);
      if (!moderation.safe) {
        logger.warn("[ai-assistant] Output moderation triggered", { violations: moderation.violations });
      }
      const reply = moderation.output;

      if (isSimpleQuery && reply.length > 20) {
        setCachedLLMResponse(auth.tenantId, "assistant", userMessage, reply);
      }

      logger.info("[ai-assistant] Token usage", { ...totalUsage, attempts: followUpRes.attempts });
      recordAISuccess("ai-assistant");
      recordTokenUsage(auth.tenantId, totalUsage.totalTokens);
      if (abVariant) recordVariantUsage("assistant-detail", abVariant.id, { tokensUsed: totalUsage.totalTokens });

      // ── Auto quality evaluation (fire-and-forget) ──────────────────────────────
      const qualityScore = evaluateResponse(userMessage, reply, "assistant");

      // ── Save to conversation memory (fire-and-forget) ───────────────────
      if (activeConversationId) {
        saveMessage(activeConversationId, "user", userMessage).catch(() => {});
        saveMessage(activeConversationId, "assistant", reply, {
          mode: "ai",
          tokensUsed: totalUsage.totalTokens,
        }).catch(() => {});
      }

      return NextResponse.json({
        response: reply,
        mode: "ai" as const,
        conversationId: activeConversationId,
        abVariant: abVariant?.id ?? null,
        agentToolsUsed: toolCalls.map((tc: { function: { name: string } }) => tc.function.name),
        tokensUsed: totalUsage.totalTokens,
        budgetWarning: budget.warning,
        qualityScore: qualityScore.overall,
        snapshot: snapshot.metrics,
      });
    }

    // ── No tool calls — direct response ─────────────────────────────────────
    const rawDirectReply = (assistantMessage?.content as string) ?? "No pude generar una respuesta.";

    // If streaming was requested but we got a non-streaming first pass,
    // re-call with streaming since no tools were needed
    if (wantStream) {
      const streamRes = await fetchGroqWithRetry(apiKey, {
        model: "llama-3.3-70b-versatile",
        messages,
        temperature: AI_TEMPERATURES.gerente,
        max_tokens: 1500,
        stream: true,
      }, "ai-assistant-stream");

      if (streamRes.ok && streamRes.body) {
        return streamGroqResponse(streamRes.body);
      }
    }

    // ── Output moderation ───────────────────────────────────────────────────
    const directModeration = moderateLLMOutput(rawDirectReply);
    if (!directModeration.safe) {
      logger.warn("[ai-assistant] Output moderation triggered (direct)", { violations: directModeration.violations });
    }
    const directReply = directModeration.output;

    if (isSimpleQuery && directReply.length > 20) {
      setCachedLLMResponse(auth.tenantId, "assistant", userMessage, directReply);
    }

    logger.info("[ai-assistant] Token usage (direct)", { ...totalUsage, attempts: res.attempts });
    recordAISuccess("ai-assistant");
    recordTokenUsage(auth.tenantId, totalUsage.totalTokens);
    if (abVariant) recordVariantUsage("assistant-detail", abVariant.id, { tokensUsed: totalUsage.totalTokens });

    // ── Auto quality evaluation (fire-and-forget) ────────────────────────────────
    const qualityScore = evaluateResponse(userMessage, directReply, "assistant");

    // ── Save to conversation memory (fire-and-forget) ─────────────────────
    if (activeConversationId) {
      saveMessage(activeConversationId, "user", userMessage).catch(() => {});
      saveMessage(activeConversationId, "assistant", directReply, {
        mode: "ai",
        tokensUsed: totalUsage.totalTokens,
      }).catch(() => {});
    }

    return NextResponse.json({
      response: directReply,
      mode: "ai" as const,
      conversationId: activeConversationId,
      abVariant: abVariant?.id ?? null,
      tokensUsed: totalUsage.totalTokens,
      budgetWarning: budget.warning,
      qualityScore: qualityScore.overall,
      snapshot: snapshot.metrics,
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[ai-assistant] Fetch error:", errMsg);
    recordAIFailure("ai-assistant", errMsg);
    return returnRuleBased();
  }
}

// ── Stream helper ─────────────────────────────────────────────────────────────

/** Human-friendly labels for tool progress messages */
const TOOL_LABELS: Record<string, string> = {
  inventory_check_stock: "Revisando stock...",
  inventory_fefo_audit: "Auditando vencimientos...",
  inventory_reorder_suggestions: "Calculando reposición...",
  inventory_stock_valuation: "Valuando inventario...",
  inventory_movement_summary: "Analizando movimientos...",
  orders_pending_summary: "Revisando pedidos pendientes...",
  orders_delivery_schedule: "Verificando entregas...",
  orders_returns_analysis: "Analizando devoluciones...",
  orders_status_overview: "Resumen de estados...",
  orders_daily_sales_report: "Generando reporte de ventas...",
  customers_segmentation: "Segmentando clientes...",
  customers_top_customers: "Buscando mejores clientes...",
  customers_churn_risk: "Detectando clientes en riesgo...",
  customers_birthday_upcoming: "Revisando cumpleaños...",
  customers_customer_360: "Generando perfil completo...",
  analytics_daily_kpis: "Calculando KPIs del día...",
  analytics_product_performance: "Analizando productos...",
  analytics_margin_analysis: "Calculando márgenes...",
  analytics_sales_trend: "Revisando tendencias...",
  analytics_category_breakdown: "Desglose por categorías...",
  notifications_send_stock_alert: "Enviando alertas de stock...",
  notifications_send_expiry_warning: "Avisando vencimientos...",
  notifications_send_promotion: "Enviando promoción...",
  notifications_digest_pending: "Preparando resumen...",
  pricing_margin_check: "Verificando márgenes...",
  pricing_promotion_candidates: "Buscando candidatos a promo...",
  pricing_bundle_suggestions: "Buscando combos...",
  pricing_price_history: "Revisando historial de precios...",
};

function getToolLabel(toolName: string): string {
  return TOOL_LABELS[toolName] ?? `Ejecutando ${toolName.replace(/_/g, " ")}...`;
}

function streamGroqResponse(body: ReadableStream<Uint8Array>): Response {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream({
    async start(controller) {
      const reader = body.getReader();
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
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
              }
            } catch { /* skip malformed chunk */ }
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
