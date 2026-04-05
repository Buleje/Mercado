export const dynamic = "force-dynamic";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { chatCompletion, getActiveProvider } from "@/lib/ai-config";
import { ProductsDB } from "@/lib/db/products.db";

// ── FAQ knowledge base for auto-replies (fallback when no AI) ────────────────
const FAQ_ENTRIES: { keywords: string[]; answer: string }[] = [
  {
    keywords: ["delivery", "envio", "envío", "despacho", "reparto", "llega", "demora", "cuanto tarda", "cuánto tarda", "tiempo"],
    answer: "🚚 Nuestro delivery cubre Callería y alrededores en Pucallpa. El tiempo estimado es de 30-45 minutos según tu zona. ¡El delivery es GRATIS en pedidos mayores a S/30!",
  },
  {
    keywords: ["costo delivery", "cuanto cuesta delivery", "precio delivery", "cobran delivery", "cuánto cuesta el delivery"],
    answer: "🚚 ¡El delivery es GRATIS para pedidos mayores a S/30! Para pedidos menores, el costo es S/3.00 dentro de Callería.",
  },
  {
    keywords: ["horario", "hora", "abierto", "cerrado", "atienden", "abren", "cierran", "cuando"],
    answer: "🕐 Nuestro horario es:\n• Lunes a Sábado: 7:00 AM - 10:00 PM\n• Domingos: 8:00 AM - 8:00 PM\n¡Te esperamos!",
  },
  {
    keywords: ["yape", "pago", "pagar", "efectivo", "tarjeta", "transferencia", "plin", "forma de pago", "metodo de pago"],
    answer: "💰 Aceptamos varios métodos de pago:\n• Yape ✅\n• Plin ✅\n• Efectivo ✅\n• Transferencia bancaria ✅\nPuedes elegir tu método favorito al momento del checkout.",
  },
  {
    keywords: ["pedido", "estado", "seguir", "rastrear", "donde esta", "dónde está", "tracking", "mi pedido"],
    answer: "📦 Para ver el estado de tu pedido, haz clic en el ícono de 📦 en la parte superior de la página. Ahí verás el progreso en tiempo real: recibido → confirmado → en camino → entregado.",
  },
  {
    keywords: ["descuento", "oferta", "promocion", "promoción", "cupón", "cupon", "rebaja"],
    answer: "🎉 ¡Tenemos ofertas todos los días! Revisa nuestra sección de 'Ofertas del Día' en la página principal. También puedes aplicar cupones de descuento al momento del checkout.",
  },
  {
    keywords: ["devolucion", "devolución", "cambio", "reclamo", "queja", "problema", "mal estado"],
    answer: "🔄 Si tu producto llegó en mal estado o hubo un error, escríbenos por WhatsApp al número de la tienda y lo resolvemos enseguida. Tenemos política de devolución/cambio en las primeras 24 horas.",
  },
  {
    keywords: ["whatsapp", "contacto", "telefono", "teléfono", "llamar", "numero", "número"],
    answer: "📱 Puedes contactarnos por WhatsApp para pedidos personalizados o consultas especiales. ¡Estamos para ayudarte!",
  },
  {
    keywords: ["ubicacion", "ubicación", "direccion", "dirección", "donde estan", "dónde están", "mapa"],
    answer: "📍 Estamos ubicados en Jr. San Martín, Callería — Pucallpa, Ucayali. Puedes ver nuestra ubicación en el mapa de la página principal.",
  },
  {
    keywords: ["receta", "preparar", "cocinar", "ingredientes"],
    answer: "👨‍🍳 ¡Nos encanta ayudarte a cocinar! Revisa nuestra sección de 'Recetas' en la página principal donde encontrarás ideas con los ingredientes que vendemos.",
  },
];

const BodySchema = z.object({
  message: z.string().min(1).max(500),
});

function findAutoReply(message: string): string | null {
  const normalized = message
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  // Score each FAQ entry by keyword matches
  let bestMatch: { answer: string; score: number } | null = null;

  for (const entry of FAQ_ENTRIES) {
    let score = 0;
    for (const keyword of entry.keywords) {
      const normalizedKeyword = keyword
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      if (normalized.includes(normalizedKeyword)) {
        score += normalizedKeyword.length; // longer keyword = more specific match
      }
    }
    if (score > 0 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { answer: entry.answer, score };
    }
  }

  return bestMatch?.answer ?? null;
}

// ── Product search for inventory queries ──────────────────────────────────────

async function searchProducts(query: string): Promise<string | null> {
  const normalized = query
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  // Detect if the message is asking about a product (stock, price, availability)
  const productKeywords = [
    "tienen", "hay", "venden", "precio", "cuanto cuesta", "cuánto cuesta",
    "stock", "disponible", "producto", "busco", "necesito", "quiero",
  ];
  const isProductQuery = productKeywords.some(k => normalized.includes(k));
  if (!isProductQuery) return null;

  try {
    const allProducts = await ProductsDB.getAll();
    const activeProducts = allProducts.filter(p => p.active !== false);

    // Extract the product name from the query by removing known verbs/words
    const removeWords = [
      "tienen", "hay", "venden", "precio", "cuanto", "cuánto", "cuesta", "del", "de", "la", "el",
      "los", "las", "un", "una", "unos", "unas", "me", "por", "favor", "stock", "disponible",
      "producto", "busco", "necesito", "quiero", "comprar", "llevar",
    ];
    let searchTerm = normalized;
    for (const w of removeWords) {
      searchTerm = searchTerm.replace(new RegExp(`\\b${w}\\b`, "g"), "").trim();
    }
    searchTerm = searchTerm.replace(/[?¿!¡.,]/g, "").trim();
    if (searchTerm.length < 2) return null;

    // Score products by name match
    const matches = activeProducts
      .map(p => {
        const pName = p.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const terms = searchTerm.split(/\s+/).filter(t => t.length >= 2);
        const score = terms.reduce((s, t) => s + (pName.includes(t) ? t.length : 0), 0);
        return { product: p, score };
      })
      .filter(m => m.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    if (matches.length === 0) return null;

    const lines = matches.map(m => {
      const p = m.product;
      const stockInfo = p.stock != null ? (p.stock > 0 ? `✅ ${p.stock} disponibles` : "❌ Agotado") : "📦 Consultar";
      return `• ${p.name} — S/${(p.price ?? 0).toFixed(2)} — ${stockInfo}`;
    });

    return `PRODUCTOS ENCONTRADOS EN INVENTARIO:\n${lines.join("\n")}`;
  } catch {
    return null;
  }
}

// POST: Get AI auto-reply for a customer message
export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Mensaje inválido" }, { status: 400 });
  }

  const message = parsed.data.message;

  // 1. Try FAQ first (instant, no API cost)
  const faqReply = findAutoReply(message);
  if (faqReply) {
    return NextResponse.json({ reply: faqReply, type: "auto" as const });
  }

  // 2. Try real AI if any provider is configured
  const provider = getActiveProvider();
  if (provider) {
    // Search for real product info if the customer asks about products
    const productInfo = await searchProducts(message);

    try {
      const systemContent = `Eres el asistente virtual de Bodega San Martín, una bodega familiar en Pucallpa, Perú.
Responde en español de forma amable y breve (máximo 3 oraciones).
Solo responde sobre temas de la bodega: productos, precios, delivery, horarios, pagos, pedidos.
Si preguntan algo que no sabes o no es del negocio, di amablemente que pasarás su consulta al equipo.
Horario: Lun-Sáb 7AM-10PM, Dom 8AM-8PM.
Delivery gratis en pedidos mayores a S/30. Zona: Callería, Pucallpa.
Aceptamos: Yape, Plin, efectivo, transferencia.
${productInfo ? `\nINVENTARIO REAL (usa estos datos para responder, son precios y stock ACTUALIZADOS):\n${productInfo}\nSi el producto aparece en la lista, da el precio y stock REAL. Si está agotado, dilo y sugiere alternativas de la lista.` : ""}
NO inventes precios ni stock. Si no encuentras el producto en los datos, sugiere al cliente visitar la tienda o escribir el nombre exacto.`;

      const aiResult = await chatCompletion([
        { role: "system", content: systemContent },
        { role: "user", content: message },
      ], { maxTokens: 200, temperature: 0.6 });

      if (aiResult.ok && aiResult.content) {
        return NextResponse.json({
          reply: aiResult.content,
          type: "ai" as const,
          provider: aiResult.provider,
        });
      }
    } catch {
      // AI failed — fall through to generic fallback
    }
  }

  // 3. No AI available or AI failed — try direct product response, then generic fallback
  const directProducts = await searchProducts(message);
  if (directProducts) {
    return NextResponse.json({
      reply: `📋 Esto encontré en nuestro inventario:\n\n${directProducts}\n\n¿Te gustaría hacer un pedido? 🛒`,
      type: "auto" as const,
    });
  }

  return NextResponse.json({
    reply: "🤔 No tengo una respuesta automática para eso. Tu mensaje será enviado a nuestro equipo y te responderán pronto. ¡Gracias por tu paciencia!",
    type: "fallback" as const,
  });
}
