import { NextResponse } from "next/server";
import { OrdersDB, CustomersDB, normalizePhone } from "@/lib/jsondb";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ phone: string }> }
) {
  const { phone } = await ctx.params;
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GROQ_API_KEY no configurada. Obtén una clave GRATUITA en console.groq.com y agrégala en tu .env" },
      { status: 503 }
    );
  }

  const normalized = normalizePhone(phone);
  const [customer, orders] = await Promise.all([
    CustomersDB.getByPhone(normalized),
    OrdersDB.getByCustomerPhone(normalized),
  ]);

  if (!customer) {
    return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
  }

  if (orders.length === 0) {
    return NextResponse.json({
      analysis: `${customer.name} aún no tiene compras registradas. No es posible generar un análisis de gustos.`,
    });
  }

  // Build purchase summary for the AI
  const productCounts: Record<string, { qty: number; times: number; total: number }> = {};
  let totalSpent = 0;

  for (const order of orders) {
    totalSpent += order.total;
    for (const item of order.items) {
      if (!productCounts[item.name]) {
        productCounts[item.name] = { qty: 0, times: 0, total: 0 };
      }
      productCounts[item.name].qty += item.quantity;
      productCounts[item.name].times += 1;
      productCounts[item.name].total += item.price * item.quantity;
    }
  }

  const topProducts = Object.entries(productCounts)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 15)
    .map(([name, d]) => `${name}: ${d.qty} unidades en ${d.times} compras (S/${d.total.toFixed(2)})`);

  const prompt = `Eres un analista de marketing de una bodega/tienda de abarrotes en Perú.

Analiza el historial de compras de este cliente y genera un resumen DETALLADO de sus gustos y preferencias para poder enviarle promociones personalizadas.

CLIENTE: ${customer.name}
TELÉFONO: ${customer.phone}
TOTAL DE COMPRAS: ${orders.length} pedidos
GASTO TOTAL: S/${totalSpent.toFixed(2)}
GASTO PROMEDIO POR PEDIDO: S/${(totalSpent / orders.length).toFixed(2)}

PRODUCTOS MÁS COMPRADOS:
${topProducts.join("\n")}

HISTORIAL DE COMPRAS (últimas ${Math.min(orders.length, 10)}):
${orders.slice(0, 10).map(o =>
  `- ${o.createdAt.slice(0, 10)}: ${o.items.map(i => `${i.quantity}x ${i.name}`).join(", ")} = S/${o.total.toFixed(2)} (${o.paymentMethod ?? "no especificado"})`
).join("\n")}

Responde en español con formato Markdown. Incluye:
1. **Perfil del cliente** (tipo de comprador, frecuencia)
2. **Productos favoritos** y categorías preferidas
3. **Patrones de compra** (horarios, días, montos)
4. **Recomendaciones de promociones** específicas para este cliente
5. **Productos sugeridos** que podría interesarle basado en sus compras
6. **Mejor tipo de oferta** (descuento %, 2x1, combo, etc.)`;

  try {
    const res = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.7,
          max_tokens: 1500,
        }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error("Groq error:", errText);
      return NextResponse.json({ error: `Error IA ${res.status}` }, { status: 502 });
    }

    const data = await res.json();
    const analysis = data.choices?.[0]?.message?.content ?? "No se pudo generar el análisis.";

    return NextResponse.json({ analysis });
  } catch {
    return NextResponse.json({ error: "Error al conectar con la IA" }, { status: 502 });
  }
}
