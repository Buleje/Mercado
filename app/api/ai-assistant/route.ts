export const dynamic = 'force-dynamic'
import { NextResponse, type NextRequest } from "next/server";
import { ProductsDB, OrdersDB, CustomersDB, SalesDB, PayablesDB, PurchasesDB, ReviewsDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";

// ── Snapshot cache (5 min TTL) ────────────────────────────────────────────────

let cachedSnapshot: { text: string; metrics: Record<string, unknown>; ts: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getBusinessSnapshot() {
  const now = Date.now();
  if (cachedSnapshot && now - cachedSnapshot.ts < CACHE_TTL) return cachedSnapshot;

  const [products, orders, customers, sales, payables, purchases, reviews] = await Promise.all([
    ProductsDB.getAll(), OrdersDB.getAll(), CustomersDB.getAll(),
    SalesDB.getAll(), PayablesDB.getAll(), PurchasesDB.getAll(), ReviewsDB.getAll(),
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
  const weekOrders = validOrders.filter(o => o.createdAt?.slice(0, 10)! >= weekAgo);
  const monthOrders = validOrders.filter(o => o.createdAt?.slice(0, 10)! >= monthAgo);

  const todaySales = sales.filter(s => s.createdAt?.slice(0, 10) === today);
  const weekSales = sales.filter(s => s.createdAt?.slice(0, 10)! >= weekAgo);

  const todayRevenue = todayOrders.reduce((s, o) => s + o.total, 0) + todaySales.reduce((s, sl) => s + sl.total, 0);
  const weekRevenue = weekOrders.reduce((s, o) => s + o.total, 0) + weekSales.reduce((s, sl) => s + sl.total, 0);
  const monthRevenue = monthOrders.reduce((s, o) => s + o.total, 0) + sales.filter(s => s.createdAt?.slice(0, 10)! >= monthAgo).reduce((s, sl) => s + sl.total, 0);

  const pendingOrders = orders.filter(o => o.status === "pendiente").length;
  const cancelledMonth = orders.filter(o => o.status === "cancelado" && o.createdAt?.slice(0, 10)! >= monthAgo).length;

  const costMap: Record<string, number> = {};
  products.forEach(p => { if (p.costPrice) costMap[p.id] = p.costPrice; });
  const monthCost = [...monthOrders.flatMap(o => o.items), ...sales.filter(s => s.createdAt?.slice(0, 10)! >= monthAgo).flatMap(s => s.items)]
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

  const metrics = { todayRevenue, weekRevenue, pendingOrders, outOfStock: outOfStock.length, lowStock: lowStock.length, overdueCount, totalDebt };
  cachedSnapshot = { text, metrics, ts: now };
  return cachedSnapshot;
}

const SYSTEM_PROMPT_TEMPLATE = (snapshot: string) => `Eres el Asistente Ejecutivo IA de "Bodega San Martín", una tienda de abarrotes premium en Pucallpa, Perú.

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
Máximo 3 acciones por mensaje.`;

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  // ── Rate limiting: 15 requests / 5 min per IP ──────────────────────────────
  const rateLimited = applyRateLimit(req, "MODERATE", "ai-assistant");
  if (rateLimited) return rateLimited;

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GROQ_API_KEY no configurada. Obtén una clave GRATUITA en console.groq.com y agrégala en tu .env" },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => ({ message: "", history: [] }));
  const userMessage = (body.message ?? "").trim();
  const history: { role: string; content: string }[] = body.history ?? [];
  const wantStream = body.stream !== false; // default: stream

  if (!userMessage) {
    return NextResponse.json({ error: "Mensaje requerido" }, { status: 400 });
  }

  // ── Build snapshot (cached 5 min) ───────────────────────────────────────────
  const snapshot = await getBusinessSnapshot();

  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT_TEMPLATE(snapshot.text) },
    ...history.slice(-8).map(m => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user" as const, content: userMessage },
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
        stream: wantStream,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Groq AI assistant error:", errText);
      return NextResponse.json({ error: `Error IA: ${res.status}` }, { status: 502 });
    }

    // ── Streaming response ────────────────────────────────────────────────────
    if (wantStream && res.body) {
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

    // ── Non-streaming fallback ────────────────────────────────────────────────
    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content ?? "No pude generar una respuesta.";

    return NextResponse.json({ reply, snapshot: snapshot.metrics });
  } catch {
    return NextResponse.json({ error: "Error al conectar con la IA" }, { status: 502 });
  }
}
