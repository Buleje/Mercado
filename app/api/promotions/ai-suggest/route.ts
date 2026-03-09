export const dynamic = 'force-dynamic'
import { NextResponse } from "next/server";
import { OrdersDB, CustomersDB } from "@/lib/jsondb";

export async function POST(req: Request) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GROQ_API_KEY no configurada. Obtén una clave GRATUITA en console.groq.com y agrégala en tu .env" },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const context = body.context || "";

  const [customers, orders] = await Promise.all([
    CustomersDB.getAll(),
    OrdersDB.getAll(),
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

  const topCustomers = Object.entries(customerStats)
    .sort((a, b) => b[1].spent - a[1].spent)
    .slice(0, 10)
    .map(([phone, s]) => `${s.name} (${phone}): ${s.orders} pedidos, S/${s.spent.toFixed(2)} gastado – favoritos: ${Object.entries(s.products).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n, q]) => `${n}(${q})`).join(", ")}`);

  const prompt = `Eres un experto en marketing para una bodega/tienda de abarrotes en Pucallpa, Perú llamada "Bodega San Martín".

Genera sugerencias de PROMOCIONES y PUBLICIDAD basadas en los datos de ventas y clientes.

ESTADÃSTICAS GENERALES:
- Total clientes: ${customers.length}
- Total pedidos: ${orders.length}
- Productos más vendidos:
${topGlobal.join("\n")}

TOP 10 CLIENTES:
${topCustomers.join("\n")}

${context ? `CONTEXTO ADICIONAL DEL USUARIO: ${context}` : ""}

Responde en español con formato Markdown. Para cada sugerencia incluye:
1. **Nombre de la promoción**
2. **Tipo**: descuento %, 2x1, combo, envío gratis, etc.
3. **Productos incluidos**
4. **Público objetivo**: todos, top clientes, clientes nuevos, grupo específico
5. **Mensaje sugerido para WhatsApp** (corto, persuasivo, con emojis)
6. **Porcentaje de descuento sugerido**

Genera al menos 5 promociones diferentes clasificadas por tipo de audiencia.`;

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
          max_tokens: 2000,
        }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error("Groq error:", errText);
      return NextResponse.json({ error: `Error IA ${res.status}` }, { status: 502 });
    }

    const data = await res.json();
    const suggestions = data.choices?.[0]?.message?.content ?? "No se pudieron generar sugerencias.";

    return NextResponse.json({ suggestions });
  } catch {
    return NextResponse.json({ error: "Error al conectar con la IA" }, { status: 502 });
  }
}
