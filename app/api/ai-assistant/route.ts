import { NextResponse, type NextRequest } from "next/server";
import { ProductsDB, OrdersDB, CustomersDB, SalesDB, PayablesDB, PurchasesDB, ReviewsDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { processSafeInput, buildInjectionGuard, detectPromptInjection, moderateLLMOutput } from "@/lib/ai-safety";
import { getCachedLLMResponse, setCachedLLMResponse } from "@/lib/llm-cache";
import { ALL_AGENT_TOOLS, resolveToolCall, isToolApprovalRequired } from "@/lib/agents/tool-definitions";
import { toolsParaMensaje, tokensAproximados } from "@/lib/agents/tool-routing";
import { orchestrator, ensureAgentsRegistered } from "@/lib/agents";
import { stashPendingApproval } from "@/lib/agents/pending-approvals";
import { callLLM } from "@/lib/llm-router";
import type { LLMUsage } from "@/lib/llm-providers";
import { checkTokenBudget, recordTokenUsage } from "@/lib/ai-usage-tracker";
import { recordAIFailure, recordAISuccess } from "@/lib/ai-failure-monitor";
import { getOrCreateConversation, loadConversationHistory, saveMessage } from "@/lib/ai-conversation-memory";
import { getPromptVariant, recordVariantUsage } from "@/lib/ai-ab-testing";
import { evaluateResponse } from "@/lib/ai-quality-evaluator";
import { AI_TEMPERATURES } from "@/lib/ai-temperatures";

// ── Snapshot cache (5 min TTL) ────────────────────────────────────────────────

type BusinessSnapshot = { text: string; metrics: Record<string, unknown>; ts: number };
// SECURITY 2026-05-26 (P0-3): el cache era una variable global ÚNICA, no keyed
// por tenant → el 1er tenant en llamar llenaba la cache y los demás recibían SUS
// datos de negocio en el contexto del asistente IA durante 5min (fuga cross-tenant
// + cache miss garantizado por tenant = los 7 full-scans / timeout 15s). Map por
// tenantId cierra ambos: aislamiento real + cache hit efectivo por tienda.
const snapshotByTenant = new Map<string, BusinessSnapshot>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getBusinessSnapshot(tenantId: string) {
  const now = Date.now();
  const cached = snapshotByTenant.get(tenantId);
  if (cached && now - cached.ts < CACHE_TTL) return cached;

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
  const snapshot: BusinessSnapshot = { text, metrics, ts: now };
  snapshotByTenant.set(tenantId, snapshot);
  return snapshot;
}

const SYSTEM_PROMPT_TEMPLATE = (snapshot: string) => `Eres el Asistente Ejecutivo IA de "Buleje", una tienda de abarrotes premium en Pucallpa, Perú.

PERSONALIDAD:
- Profesional, directo, estratégico — como un gerente general millonario que domina retail y ventas
- Hablas en español, con tono ejecutivo pero cercano
- Siempre das recomendaciones accionables y priorizadas
- Usas datos reales del negocio para respaldar cada consejo
- Formato conciso: bullets, negritas, números — no párrafos largos

MÉTODO DE EXPLICACIÓN (FEYNMAN) — muy importante:
- Explica TODO como si se lo contaras a un bodeguero que recién aprende a leer números
- Si usas un concepto técnico (ticket promedio, margen, rotación, CAC, LTV), DEBES
  definirlo entre paréntesis con palabras simples la primera vez que aparezca.
  Ejemplo: "margen (lo que te queda después de pagar al proveedor)"
- Cuando hagas un cálculo muestra la operación paso a paso con números reales:
  "S/ 5.00 de venta - S/ 3.50 que pagaste al proveedor = S/ 1.50 de ganancia (30% margen)"
- Usa analogías del día a día de la bodega:
  * "El stock es como el agua en un balde: si se acaba, pierdes ventas"
  * "Un cliente nuevo cuesta 5 veces más que retener uno viejo — es como sembrar vs cosechar"
- Nunca uses jerga en inglés sin traducir (KPI → "indicador", churn → "clientes que se van")
- Cada recomendación debe tener: (a) qué hacer, (b) por qué, (c) cuánto te va a rendir en soles o %
- Evita listas de más de 5 items por respuesta — si son más, quédate con las 5 más urgentes

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
- Responde en formato Markdown para que sea legible
- Sé conciso: máximo 300 palabras por respuesta

LLEVAR AL USUARIO A LA PANTALLA:
Nunca escribas "andá al módulo X" ni el nombre interno de un tab: llamá a la
herramienta "ui_abrir" con el destino y el chat pinta un botón que abre esa
pantalla. Si además hay un texto a buscar (un producto, un cliente, una guía),
pasalo en "filtro".

ANOTAR OPERACIONES DICTADAS (lo más importante que hacés):
Cuando el usuario dice "anotame", "apuntá", "registrá" —o simplemente cuenta algo
que pasó ("compré 25 galones de petróleo para el camión N12 a 27 el galón")—, tu
trabajo es convertirlo en un asiento real con las herramientas "plata_*". No
respondas "andá a Gastos y cargalo": anotalo.

El orden NUNCA cambia:
1. BUSCAR primero. Un camión se busca con plata_buscar_maquina, una persona con
   plata_buscar_persona, una deuda con plata_buscar_deuda. JAMÁS inventes un
   maquinaId, personaId, adelantoId ni fiadoId: si la búsqueda no lo devolvió,
   no existe. La búsqueda te dice qué hacer en su campo "mensaje": si viene
   "recomendado", usá ESE id y seguí de largo — que aparezcan otras filas
   parecidas no es una duda. Preguntá SÓLO si el mensaje te pide aclarar.
2. ANOTAR con la herramienta que corresponde. El usuario ve una tarjeta con el
   resumen y aprieta Confirmar; recién ahí se escribe. Vos no confirmás por él.
3. DECIR QUÉ QUEDÓ. Después de confirmar, repetí en una línea qué se anotó, por
   cuánto y en qué pantalla quedó (la herramienta te lo devuelve en
   "confirmacion" y "dondeVerlo"). Y ofrecé abrirla con "ui_abrir".

Qué NO hacer al anotar:
- No calcules el total vos cuando hay cantidad y precio: pasá los dos y dejá que
  el sistema multiplique. Así el usuario ve la operación completa y la puede
  auditar ("25 × S/ 27,00 = S/ 675,00").
- No completes datos que el usuario no dijo. Si falta el monto, la persona o la
  máquina, preguntá UNA cosa concreta.
- Si la herramienta devuelve un error, leelo y contalo tal cual: son mensajes
  escritos para que los entienda el dueño ("supera el límite de crédito de Juan").

Un gasto de una máquina (combustible, repuestos, operador, peaje) va al libro de
ESA máquina, no al libro de gastos del negocio; el sistema te lo dice en el
resumen y vos se lo repetís al usuario, porque si no lo va a buscar donde no está.

QUÉ NO PODÉS HACER TODAVÍA:
No podés cambiar precios, crear productos, mover pedidos ni registrar ventas de
productos desde el chat (una venta descuenta stock y emite comprobante: va por el
punto de venta). Si te lo piden, decilo con todas las letras —"eso todavía no lo
puedo hacer desde acá"— y abrí la pantalla donde sí se hace con "ui_abrir". Nunca
escribas un bloque tipo [ACTION:...] ni afirmes que ejecutaste algo que no
ejecutaste: el usuario se quedaría creyendo que se hizo.

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

/**
 * Cuando la SEGUNDA llamada al modelo falla (429 del proveedor, timeout) pero
 * los tools YA corrieron, lo que no se puede es redactar — el dato está.
 *
 * Antes acá se devolvía `generateRuleBasedResponse`, un resumen de la bodega
 * que ignoraba la pregunta: preguntando por la madera del aserradero contestaba
 * «no tengo acceso a esa información» habiendo leído el libro dos líneas antes.
 * Una respuesta que contradice lo que el sistema sabe es peor que un error.
 */
function respuestaConDatosCrudos(
  toolsUsados: { nombre: string; resultado: string }[],
  motivo?: string | null,
): string | null {
  const utiles = toolsUsados.filter((t) => {
    if (!t.resultado) return false;
    try {
      const d = JSON.parse(t.resultado) as Record<string, unknown>;
      // Un error o una acción de UI no son "datos que mostrar".
      return !d.error && !d.navegar && !d.requiresApproval;
    } catch {
      return false;
    }
  });
  if (utiles.length === 0) return null;

  const bloques = utiles
    .map((t) => {
      const etiqueta = getToolLabel(t.nombre);
      // Se recorta: el JSON de un tool puede ser largo y esto va a pantalla.
      const cuerpo = t.resultado.length > 1500 ? `${t.resultado.slice(0, 1500)}…` : t.resultado;
      return `**${etiqueta}**\n\n\`\`\`json\n${cuerpo}\n\`\`\``;
    })
    .join("\n\n");

  /**
   * Por qué falló, con el número.
   *
   * «El proveedor está saturado» manda a esperar un rato cuando el problema es
   * un límite POR MINUTO de la cuenta —que no se arregla esperando, se arregla
   * subiendo de plan—. Decirlo con la cifra es la diferencia entre que Brandon
   * reintente diez veces y que sepa qué hacer.
   */
  const porMinuto = motivo && /tokens per minute|TPM/i.test(motivo);
  // Ojo: `[^."]+` cortaba «17.2s» en «17» — el punto decimal terminaba la
  // captura y quedaba «se libera en 17», sin unidad y con el número mal.
  const espera = motivo ? /try again in\s+([0-9]+(?:\.[0-9]+)?\s*[a-z]+(?:[0-9]+(?:\.[0-9]+)?\s*[a-z]+)?)/i.exec(motivo)?.[1]?.trim() : undefined;
  const causa = porMinuto
    ? `el proveedor de IA corta por límite de tokens **por minuto** de la cuenta${espera ? `; se libera en ${espera}` : ""}`
    : "el proveedor de IA no pudo redactar";

  return `**Consulté tus datos pero no pude redactar la respuesta** (${causa}). Esto es lo que encontré, en crudo:\n\n${bloques}\n\n_Volvé a preguntar en un momento y te lo explico normal._`;
}

/**
 * La respuesta JSON del asistente, con las DOS claves.
 *
 * El endpoint devolvía `{ response }` y los dos clientes
 * (`ChatIAClean`, `AIAssistant`) leen `data.reply`. Resultado: todo el camino
 * sin streaming —fallback sin IA, respuesta cacheada, mensaje bloqueado por
 * seguridad, presupuesto agotado— llegaba al usuario como «No pude responder:
 * respuesta vacía del servidor». El dato estaba en el JSON, con otro nombre.
 *
 * Se mandan las dos claves en vez de renombrar: `response` puede tener otros
 * consumidores (tests, integraciones) y romperlos para arreglar esto sería
 * cambiar un bug por otro.
 */
function respuestaJson(texto: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ reply: texto, response: texto, ...extra });
}

/**
 * El error crudo del proveedor a algo que el dueño de la bodega pueda leer.
 * Devuelve `null` cuando no se reconoce: ahí sigue el fallback de siempre.
 */
function motivoLegible(error: string | null | undefined): string | null {
  const e = String(error ?? "");
  if (!e) return null;
  if (/rate.?limit|429|tokens per day|TPD/i.test(e)) {
    const espera = /try again in ([^."]+)/i.exec(e)?.[1]?.trim();
    return `**El asistente se quedó sin cuota por hoy.** El proveedor de IA cortó el servicio por límite diario de tokens${espera ? ` y se repone en ${espera}` : ""}.\n\nMientras tanto podés usar los módulos del panel normalmente — los datos están intactos.`;
  }
  if (/401|unauthor|api.?key|invalid.*key|permission-denied|credits/i.test(e)) {
    return "**El asistente no puede conectarse al proveedor de IA** (credencial rechazada o cuenta sin créditos). Es configuración del servidor: los datos del negocio no están afectados.";
  }
  return null;
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
    return respuestaJson(safetyCheck.reason, { mode: "blocked" as const });
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
    return respuestaJson(response, {
      mode: "rule-based" as const,
      snapshot: snapshot.metrics,
    });
  };

  // ── Router LLM (ADR-010) maneja disponibilidad internamente ──────────────
  // Si ningún provider está configurado, el router devuelve error y caemos
  // al rule-based en el bloque de manejo de errores del first call.

  // ── Token budget check — prevent overspending on AI ──────────────────────
  const budget = checkTokenBudget(auth.tenantId);
  if (!budget.allowed) {
    return respuestaJson(budget.warning ?? "Se agotó el presupuesto de IA de este mes. Volvé a intentar el mes que viene o subí el límite en Configuración.", {
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
      return respuestaJson(cached.response, {
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

  const toolsElegidas = toolsParaMensaje(userMessage);
  logger.debug("[ai-assistant] herramientas elegidas", {
    cantidad: toolsElegidas.length,
    tokensEsquema: tokensAproximados(toolsElegidas),
    deUnTotalDe: ALL_AGENT_TOOLS.length,
  });

  try {
    // ── First LLM call (with tools) — ADR-010 balanced tier ────────────────
    // Router call, primera decisión con tools. Llama-3.3-70b por default,
    // fallback a llama-4-scout si cae.
    const res = await callLLM("balanced", {
      messages,
      temperature: AI_TEMPERATURES.router,
      maxTokens: 1500,
      stream: false, // Function calling requires non-streaming first pass
      // Sólo las herramientas que la frase menciona. El catálogo entero son
      // 7.043 tokens de esquema por llamada y no entra en el límite POR MINUTO
      // de la cuenta — ver lib/agents/tool-routing.ts.
      tools: toolsElegidas,
      toolChoice: "auto",
      label: "ai-assistant",
    });

    let totalUsage: LLMUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

    if (!res.ok) {
      logger.error("[ai-assistant] LLM router error", { error: String(res.error), tenantId: auth.tenantId });
      recordAIFailure("ai-assistant", res.error ?? "unknown");
      // Un "no pude responder" a secas manda a revisar la conexión cuando el
      // problema es la cuota del proveedor y sólo hay que esperar. El motivo
      // real ya viene en el error del router: se traduce, no se esconde.
      const motivo = motivoLegible(res.error);
      if (motivo) return respuestaJson(motivo, { mode: "sin-ia" as const });
      return returnRuleBased();
    }

    totalUsage = { ...res.usage };

    // Reconstruct assistantMessage shape for backward compat with rest of code
    const assistantMessage: {
      content: string | null;
      tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
    } = {
      content: res.content,
      tool_calls: res.toolCalls ?? undefined,
    };

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
        /** Lo que devolvió cada tool — la red cuando la redacción falla. */
        const toolsEjecutados: { nombre: string; resultado: string }[] = [];
        /**
         * Cuántas tarjetas [Confirmar]/[Cancelar] quedaron esperando.
         *
         * Con una pendiente NO se encadena otra ronda de tools: el usuario ya
         * tiene una decisión sobre la mesa, y proponerle una segunda antes de
         * que responda la primera es pedirle que apruebe a ciegas.
         */
        let aprobacionesPendientes = 0;

        // TransformStream pattern — Next 16 + undici compat (avoids
        // "controller[kState].transformAlgorithm is not a function" on ReadableStream).
        // Same pattern as /api/admin/sse/route.ts.
        const tsStream = new TransformStream<Uint8Array, Uint8Array>();
        const writer = tsStream.writable.getWriter();
        let tsClosed = false;

        const send = (data: string) => {
          if (tsClosed) return;
          writer.write(encoder.encode(data)).catch(() => { tsClosed = true; });
        };

        (async () => {
          try {
            // Execute tools with progress events
            /**
             * Una ronda de herramientas: ejecuta el lote y deja cada resultado
             * en `capturedMessages` para que el modelo lo lea.
             *
             * Está extraída porque anotar algo dictado necesita DOS rondas: la
             * primera BUSCA (el camión, la persona, la deuda) y la segunda
             * ESCRIBE con el id que devolvió la primera. Con una sola ronda,
             * «anotame el combustible del camión N12» terminaba en «encontré el
             * camión» y el usuario tenía que repetir el pedido entero.
             */
            const ejecutarRonda = async (lote: { id: string; function: { name: string; arguments: string } }[]) => {
            for (const toolCall of lote) {
              const toolName = toolCall.function?.name;

              // Send progress event
              send(`data: ${JSON.stringify({ toolProgress: getToolLabel(toolName), tool: toolName })}\n\n`);

              const mapping = resolveToolCall(toolName);
              let toolResult: string;

              if (!mapping) {
                toolResult = JSON.stringify({ error: `Herramienta "${toolName}" no reconocida` });
              } else {
                let args: Record<string, unknown> = {};
                try { args = JSON.parse(toolCall.function.arguments || "{}"); } catch { args = {}; }

                // ── HITL gate (Excel Agentes IA práctica #10, TD-025) ──
                if (isToolApprovalRequired(toolName)) {
                  // ── Ensayo antes de preguntar ──────────────────────────
                  // Una confirmación sólo vale si la acción se puede hacer. Se
                  // corre el tool en modo validación: si el payload está mal
                  // (un id inventado, un producto de otro tenant), el error va
                  // al modelo y NO se ofrece confirmar nada.
                  const ensayo = await orchestrator.executeSync({
                    domain: mapping.domain,
                    action: mapping.action,
                    payload: { ...args, __validar: true },
                    tenantId: auth.tenantId,
                    actorRole: auth.role,
                  });
                  if (!ensayo.success) {
                    toolResult = JSON.stringify({ error: ensayo.error });
                    toolsEjecutados.push({ nombre: toolName, resultado: toolResult });
                    logger.info("[ai-assistant] acción rechazada en la validación", {
                      tool: toolName,
                      error: ensayo.error,
                    });
                    capturedMessages.push({
                      role: "tool" as const,
                      content: toolResult,
                      tool_call_id: toolCall.id,
                    });
                    continue;
                  }
                  const resumenEnsayo = (ensayo.data as { resumen?: string } | undefined)?.resumen;
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
                  // La tarjeta [Confirmar]/[Cancelar] en el chat. Sin esto, el
                  // stash quedaba esperando una UI que no existía: el modelo
                  // decía "pendiente de aprobación" y no había dónde aprobar.
                  send(
                    `data: ${JSON.stringify({
                      aprobacion: {
                        id: approvalId,
                        tool: toolName,
                        titulo: getToolLabel(toolName),
                        // Lo que el usuario tiene que poder juzgar de un
                        // vistazo: "Stock de Tabla de tornillo: 3 → 4".
                        resumen: resumenEnsayo ?? null,
                        payload: args,
                      },
                    })}\n\n`,
                  );
                  aprobacionesPendientes += 1;
                } else {
                  const result = await orchestrator.executeSync({
                    domain: mapping.domain,
                    action: mapping.action,
                    payload: args,
                    tenantId: auth.tenantId,
                    actorRole: auth.role, // SECURITY 2026-05-06 (audit AI #1)
                  });
                  toolResult = JSON.stringify(result.success ? result.data : { error: result.error });

                  // ── Acciones para el cliente ────────────────────────────
                  // El agente `ui` no devuelve datos: devuelve a DÓNDE hay que
                  // ir. Se emite como evento propio para que el chat pinte un
                  // botón; el texto del LLM no puede navegar, y nombrar el
                  // módulo ("andá a inventario-almacenes") deja al usuario
                  // buscando a mano lo que el asistente ya sabía.
                  const navegar = (result.data as { navegar?: unknown } | undefined)?.navegar;
                  if (result.success && navegar) {
                    send(`data: ${JSON.stringify({ accion: navegar })}\n\n`);
                  }
                }
              }

              toolsEjecutados.push({ nombre: toolName, resultado: toolResult });
              // Sin esto, un tool que devuelve `{error}` es invisible: el modelo
              // redacta "no tengo acceso a eso" y desde afuera parece que el
              // tool nunca corrió.
              logger.info("[ai-assistant] tool ejecutado", {
                tool: toolName,
                bytes: toolResult.length,
                muestra: toolResult.slice(0, 220),
              });
              capturedMessages.push({
                role: "tool" as const,
                content: toolResult,
                tool_call_id: toolCall.id,
              });
            }
            };

            await ejecutarRonda(toolCalls);

            /**
             * Segunda ronda — sólo cuando la primera fue una búsqueda que existe
             * para habilitar una escritura, y no quedó ya una confirmación
             * esperando. Fuera de ese caso no se gasta otra llamada: casi todas
             * las preguntas se contestan con una sola.
             */
            if (
              aprobacionesPendientes === 0 &&
              toolsEjecutados.some((t) => TOOLS_QUE_PRECEDEN_ESCRITURA.has(t.nombre))
            ) {
              send(`data: ${JSON.stringify({ toolProgress: "Preparando la operación...", tool: "_ronda2" })}\n\n`);
              const ronda2 = await callLLM("balanced", {
                messages: capturedMessages as Parameters<typeof callLLM>[1]["messages"],
                temperature: AI_TEMPERATURES.router,
                maxTokens: 1500,
                stream: false,
                tools: TOOLS_CIERRE,
                toolChoice: "auto",
                label: "ai-assistant-ronda2",
              });
              if (ronda2.ok) {
                totalUsage.promptTokens += ronda2.usage.promptTokens;
                totalUsage.completionTokens += ronda2.usage.completionTokens;
                totalUsage.totalTokens += ronda2.usage.totalTokens;
                recordTokenUsage(auth.tenantId, ronda2.usage.totalTokens);
                if (ronda2.toolCalls && ronda2.toolCalls.length > 0) {
                  capturedMessages.push({
                    role: "assistant" as const,
                    content: ronda2.content ?? "",
                    ...({ tool_calls: ronda2.toolCalls } as Record<string, unknown>),
                  });
                  await ejecutarRonda(ronda2.toolCalls.slice(0, 5));
                }
              } else {
                // Que falle la segunda ronda no puede tirar abajo lo ya leído:
                // se sigue derecho a redactar con lo que hay.
                logger.warn("[ai-assistant] segunda ronda de tools falló", { error: String(ronda2.error) });
              }
            }

            // Send "generating response" progress
            send(`data: ${JSON.stringify({ toolProgress: "Generando respuesta...", tool: "_final" })}\n\n`);

            // Second LLM call — stream the response via router (ADR-010)
            const followUpRes = await callLLM("balanced", {
              messages: capturedMessages as Parameters<typeof callLLM>[1]["messages"],
              temperature: AI_TEMPERATURES.toolFollowup,
              maxTokens: 1500,
              stream: true,
              label: "ai-assistant-followup",
            });

            if (!followUpRes.ok || !followUpRes.body) {
              recordAIFailure("ai-assistant-followup", followUpRes.error ?? "unknown");
              // Los datos ya se leyeron: se muestran. Sólo si no hubo ninguno
              // se cae al resumen genérico del negocio.
              /**
               * Con una tarjeta de confirmación abajo, volcar el JSON de la
               * búsqueda es ruido: la tarjeta ya dice qué se va a anotar y por
               * cuánto. Se avisa en una línea y listo.
               */
              const fallback =
                aprobacionesPendientes > 0
                  ? "Encontré lo que hacía falta y te dejé la operación lista para confirmar acá abajo. " +
                    "No alcancé a redactarlo con palabras porque el proveedor de IA cortó por límite de tokens por minuto — " +
                    "revisá el resumen de la tarjeta, que es lo que se va a anotar."
                  : (respuestaConDatosCrudos(toolsEjecutados, followUpRes.error) ??
                     generateRuleBasedResponse(userMessage, snapshot.metrics));
              send(`data: ${JSON.stringify({ content: fallback })}\n\n`);
              send("data: [DONE]\n\n");
              tsClosed = true;
              writer.close().catch((err) => logger.warn("[ai-assistant] op failed", { err: String(err) }));
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
                  send("data: [DONE]\n\n");
                  tsClosed = true;
                  writer.close().catch((err) => logger.warn("[ai-assistant] op failed", { err: String(err) }));
                  return;
                }
                try {
                  const json = JSON.parse(payload);
                  const content = json.choices?.[0]?.delta?.content;
                  if (content) {
                    send(`data: ${JSON.stringify({ content })}\n\n`);
                  }
                } catch { /* skip */ }
              }
            }

            tsClosed = true;
            writer.close().catch((err) => logger.warn("[ai-assistant] op failed", { err: String(err) }));
          } catch (err) {
            tsClosed = true;
            writer.abort(err).catch((err) => logger.warn("[ai-assistant] op failed", { err: String(err) }));
          }
        })();

        return new Response(tsStream.readable, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
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
            /**
             * El ensayo va también acá.
             *
             * Este camino (cliente que pide `stream: false`) no lo usa el chat,
             * pero stasheaba sin validar: dejaba pendiente de confirmar una
             * acción con un id inventado, y el resumen que vería quien la
             * aprueba sería el payload crudo. Desde que hay ocho acciones que
             * escriben plata, la asimetría dejó de ser teórica.
             */
            const ensayo = await orchestrator.executeSync({
              domain: mapping.domain,
              action: mapping.action,
              payload: { ...args, __validar: true },
              tenantId: auth.tenantId,
              actorRole: auth.role,
            });
            if (!ensayo.success) {
              toolResult = JSON.stringify({ error: ensayo.error });
            } else {
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
                resumen: (ensayo.data as { resumen?: string } | undefined)?.resumen ?? null,
                message: `Acción "${toolName}" pendiente de aprobación humana. Un admin debe confirmarla antes de ejecutar.`,
              });
            }
          } else {
            const result = await orchestrator.executeSync({
              domain: mapping.domain,
              action: mapping.action,
              payload: args,
              tenantId: auth.tenantId,
              actorRole: auth.role, // SECURITY 2026-05-06 (audit AI #1)
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

      // ── Second LLM call with tool results (ADR-010 balanced) ──────────
      const followUpRes = await callLLM("balanced", {
        messages: messages as Parameters<typeof callLLM>[1]["messages"],
        temperature: AI_TEMPERATURES.toolFollowup,
        maxTokens: 1500,
        stream: wantStream,
        label: "ai-assistant-followup",
      });

      if (!followUpRes.ok) {
        logger.error("[ai-assistant] LLM router follow-up error", { error: String(followUpRes.error), tenantId: auth.tenantId });
        recordAIFailure("ai-assistant-followup", followUpRes.error ?? "unknown");
        return returnRuleBased();
      }

      totalUsage.promptTokens += followUpRes.usage.promptTokens;
      totalUsage.completionTokens += followUpRes.usage.completionTokens;
      totalUsage.totalTokens += followUpRes.usage.totalTokens;

      // ── Stream the follow-up response if requested ──────────────────────
      if (wantStream && followUpRes.body) {
        return streamGroqResponse(followUpRes.body);
      }

      const rawReply = followUpRes.content ?? "No pude generar una respuesta.";

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
        saveMessage(activeConversationId, "user", userMessage).catch((err) => logger.warn("[ai-assistant] op failed", { err: String(err) }));
        saveMessage(activeConversationId, "assistant", reply, {
          mode: "ai",
          tokensUsed: totalUsage.totalTokens,
        }).catch((err) => logger.warn("[ai-assistant] op failed", { err: String(err) }));
      }

      return respuestaJson(reply, {
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
    // re-call with streaming since no tools were needed (ADR-010 balanced).
    if (wantStream) {
      const streamRes = await callLLM("balanced", {
        messages: messages as Parameters<typeof callLLM>[1]["messages"],
        temperature: AI_TEMPERATURES.gerente,
        maxTokens: 1500,
        stream: true,
        label: "ai-assistant-stream",
      });

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
      saveMessage(activeConversationId, "user", userMessage).catch((err) => logger.warn("[ai-assistant] op failed", { err: String(err) }));
      saveMessage(activeConversationId, "assistant", directReply, {
        mode: "ai",
        tokensUsed: totalUsage.totalTokens,
      }).catch((err) => logger.warn("[ai-assistant] op failed", { err: String(err) }));
    }

    return respuestaJson(directReply, {
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
    logger.error("[ai-assistant] Fetch error", { error: errMsg, tenantId: auth.tenantId });
    recordAIFailure("ai-assistant", errMsg);
    return returnRuleBased();
  }
}

// ── Stream helper ─────────────────────────────────────────────────────────────

/**
 * Herramientas que sólo existen para habilitar una escritura.
 *
 * Después de una de estas el modelo TIENE el id que le faltaba, así que vale la
 * pena una segunda ronda de tools antes de redactar: es la diferencia entre
 * anotar la operación en la misma frase y contestar «encontré el camión».
 */
const TOOLS_QUE_PRECEDEN_ESCRITURA = new Set([
  "plata_buscar_maquina",
  "plata_buscar_persona",
  "plata_buscar_deuda",
  "inventory_buscar_producto",
]);

/**
 * Las herramientas de la SEGUNDA ronda: sólo las que cierran una operación.
 *
 * Mandar el catálogo entero de vuelta cuesta ~5.000 tokens de puro esquema, y
 * en la segunda vuelta no sirve de nada: el modelo ya decidió qué quiere hacer
 * y sólo le falta el id que trajo la búsqueda. Con el free tier de Groq
 * (8.000 tokens POR MINUTO) esa diferencia es la que decide si la operación se
 * anota o si el usuario ve «no pude redactar la respuesta».
 */
const TOOLS_CIERRE = ALL_AGENT_TOOLS.filter(
  (t) =>
    (t.function.name.startsWith("plata_") && !TOOLS_QUE_PRECEDEN_ESCRITURA.has(t.function.name)) ||
    t.function.name === "inventory_ajustar_stock" ||
    t.function.name === "ui_abrir",
);

/** Human-friendly labels for tool progress messages */
const TOOL_LABELS: Record<string, string> = {
  inventory_check_stock: "Revisando stock...",
  inventory_fefo_audit: "Auditando vencimientos...",
  inventory_reorder_suggestions: "Calculando reposición...",
  inventory_stock_valuation: "Valuando inventario...",
  inventory_movement_summary: "Analizando movimientos...",
  inventory_buscar_producto: "Buscando el producto...",
  inventory_ajustar_stock: "Ajustar stock",
  forestal_existencias: "Leyendo el libro forestal...",
  forestal_buscar_guia: "Buscando la guía GTF...",
  forestal_buscar_troza: "Buscando la troza...",
  forestal_pendientes: "Revisando el cumplimiento SERFOR...",
  ui_abrir: "Preparando el acceso...",
  documentos_buscar: "Buscando en el drive...",
  documentos_por_vencer: "Revisando vencimientos de papeles...",
  caja_estado: "Mirando la caja...",
  cobranzas_fiados: "Sumando lo que te deben...",
  cobranzas_adelantos: "Revisando adelantos...",
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
  plata_buscar_maquina: "Buscando la máquina...",
  plata_buscar_persona: "Buscando a la persona...",
  plata_buscar_deuda: "Buscando la deuda...",
  plata_registrar_gasto: "Anotar el gasto",
  plata_registrar_ingreso: "Anotar el ingreso",
  plata_registrar_adelanto: "Anotar el adelanto",
  plata_cobrar_fiado: "Registrar el cobro",
  plata_liquidar_adelanto: "Descontar del adelanto",
  n8n_listar_flujos: "Mirando tus automatizaciones...",
  n8n_disparar_flujo: "Disparar la automatización",
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
