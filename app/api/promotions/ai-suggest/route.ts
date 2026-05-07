import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { OrdersDB, CustomersDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";
import { AI_TEMPERATURES } from "@/lib/ai-temperatures";
import { callLLM } from "@/lib/llm-router";
import { safeParseJSON } from "@/lib/ai-json-parser";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

// ADR-009: schema estructurado para el output del LLM. El LLM devuelve
// JSON con un campo `markdown` renderizable (mantiene compat con el
// frontend actual que usa dangerouslySetInnerHTML) y un array `items`
// con datos tipados para UI futura más rica.
const PromoSuggestionSchema = z.object({
  markdown: z.string(),
  items: z
    .array(
      z.object({
        name: z.string(),
        type: z.string(),
        audience: z.string(),
        message: z.string(),
        discountPercent: z.number().optional(),
      }),
    )
    .default([]),
});

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "promotions-ai-suggest"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  // ADR-010: router LLM verifica disponibilidad de providers internamente.

  const body = await req.json().catch(() => ({}));
  const context = body.context || "";

  const [customers, orders] = await Promise.all([
    CustomersDB.getAll(auth.tenantId),
    OrdersDB.getAll(auth.tenantId),
  ]);

  // Aggregate stats
  const customerStats: Record<string, { name: string; orders: number; spent: number; products: Record<string, number> }> = {};

  for (const order of orders) {
    const phone = order.customer.phone ?? "guest";
    if (!customerStats[phone]) {
      customerStats[phone] = { name: order.customer.name, orders: 0, spent: 0, products: {} };
    }
    customerStats[phone].orders += 1;
    customerStats[phone].spent += order.total;
    for (const item of order.items) {
      customerStats[phone].products[item.name] = (customerStats[phone].products[item.name] || 0) + item.quantity;
    }
  }

  // Global product popularity
  const globalProducts: Record<string, number> = {};
  for (const order of orders) {
    for (const item of order.items) {
      globalProducts[item.name] = (globalProducts[item.name] || 0) + item.quantity;
    }
  }

  const topGlobal = Object.entries(globalProducts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([name, qty]) => `${name}: ${qty} unidades`);

  // F2 — PII Ley 29733: anonimizar antes de enviar a LLM externo.
  // Nombre y teléfono real no son necesarios para sugerir promociones;
  // bastan stats agregadas. Se reemplaza por id opaco customer_0..9.
  const topCustomers = Object.entries(customerStats)
    .sort((a, b) => b[1].spent - a[1].spent)
    .slice(0, 10)
    .map(([, s], idx) => {
      const topProducts = Object.entries(s.products)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([n, q]) => `${n}(${q})`)
        .join(", ");
      return `cliente_${idx}: ${s.orders} pedidos, S/${s.spent.toFixed(2)} gastado – favoritos: ${topProducts}`;
    });

  const prompt = `Eres un experto en marketing para una bodega/tienda de abarrotes en Pucallpa, Perú llamada "Buleje".

Genera sugerencias de PROMOCIONES y PUBLICIDAD basadas en los datos de ventas y clientes.

ESTADÃSTICAS GENERALES:
- Total clientes: ${customers.length}
- Total pedidos: ${orders.length}
- Productos más vendidos:
${topGlobal.join("\n")}

TOP 10 CLIENTES:
${topCustomers.join("\n")}

${context ? `CONTEXTO ADICIONAL DEL USUARIO: ${context}` : ""}

Responde SOLO con JSON válido (sin markdown fences, sin texto fuera del JSON) con este schema exacto:
{
  "markdown": "string — version markdown renderizable con TODAS las promos, cada una con su nombre, tipo, productos, publico, mensaje WhatsApp y descuento. Usa emojis y formato bold.",
  "items": [
    {
      "name": "string — nombre corto de la promo",
      "type": "string — descuento %, 2x1, combo, envio gratis, etc",
      "audience": "string — todos, top clientes, clientes nuevos, etc",
      "message": "string — mensaje WhatsApp corto y persuasivo con emojis",
      "discountPercent": 20
    }
  ]
}

Genera al menos 5 promociones diferentes clasificadas por tipo de audiencia.`;

  try {
    // ADR-010: router LLM balanced tier. Generación creativa de promociones.
    const res = await callLLM("balanced", {
      messages: [{ role: "user", content: prompt }],
      temperature: AI_TEMPERATURES.creative,
      maxTokens: 2000,
      label: "promotions-ai-suggest",
    });

    if (!res.ok) {
      logger.error("[promotions-ai-suggest] router error", { err: String(res.error) });
      return NextResponse.json({ error: res.error ?? "Error IA" }, { status: 502 });
    }

    const rawContent = res.content ?? "";

    // ADR-009: parse defensivo con schema Zod. Si el LLM falla el formato,
    // fallback: usamos el texto crudo como markdown (el frontend sigue
    // funcionando aunque no haya items estructurados).
    const parsed = safeParseJSON(rawContent, PromoSuggestionSchema);
    if (!parsed.ok) {
      logger.warn("[promotions-ai-suggest] malformed JSON from LLM, falling back to raw", {
        error: parsed.error,
        tenantId: auth.tenantId,
      });
      return NextResponse.json({
        suggestions: rawContent || "No se pudieron generar sugerencias.",
        items: [],
        _malformed: true,
      });
    }

    // Mantiene compat con el frontend actual: `suggestions` sigue siendo el
    // markdown. Añade `items` para consumers futuros con UI estructurada.
    return NextResponse.json({
      suggestions: parsed.data.markdown,
      items: parsed.data.items,
    });
  } catch {
    return NextResponse.json({ error: "Error al conectar con la IA" }, { status: 502 });
  }
}
