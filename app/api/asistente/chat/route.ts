import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateText } from "ai";
import { chatModel, getActiveProvider } from "@/lib/ai/provider";
import { searchProductsCrossTenant } from "@/lib/whatsapp/concierge/cross-tenant-search";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

// Next 16 con cacheComponents: true prohíbe `export const dynamic`. El handler
// es dinámico por naturaleza (lee req.json), no necesita la flag.

const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(2000),
});

const BodySchema = z.object({
  messages: z.array(MessageSchema).min(1).max(20),
});

const SYSTEM_PROMPT = `Eres el asistente del marketplace Buleje (Pucallpa, Perú).
Hablas español-Perú natural, breve, cálido, sin formalismos. Usás "te recomiendo",
"podés", "vas a quedar contento". Una respuesta = 2-4 oraciones máximo.

Lo que sabés del marketplace:
- Buleje es un marketplace que conecta clientes con bodegas locales de Pucallpa, Iquitos y otras ciudades del Perú.
- Pago: Yape, Plin, efectivo contra entrega, tarjeta.
- Delivery: 25-90 minutos según zona. Express en algunas zonas.
- Cobertura: Yarinacocha, Centro, Manantay, Callería, San Fernando, Puerto Callao.
- Categorías populares: abarrotes, frutas y verduras, carnicería, lácteos, bebidas, limpieza.
- Productos típicos amazónicos: paiche, plátano verde, yuca, aguaje, camu camu, ají charapita.

Cuando un cliente pregunta por productos específicos:
- Si te paso un bloque "[PRODUCTOS DISPONIBLES]", úsalo para recomendar 1-3 productos por nombre y tienda.
- Si NO te paso productos, decí "te paso al marketplace" y sugerí buscar la categoría.

Cuando preguntan por delivery, pago, horarios, devoluciones — respondé con info concreta arriba.

NUNCA inventes precios, descuentos, ni tiendas que no estén en el bloque productos.
NUNCA promesas como "100% fresco" o "garantía" que el marketplace no ofrece.
SI no sabés algo, decí "tendría que confirmar con la bodega" y sugerí abrir WhatsApp.`;

/**
 * Decide si la pregunta del cliente es sobre productos específicos.
 * Heurística simple: contiene un sustantivo común de bodega.
 */
function detectProductIntent(text: string): string | null {
  const keywords = [
    "arroz", "aceite", "azucar", "azúcar", "leche", "pollo", "carne",
    "huevo", "pan", "queso", "yogurt", "fruta", "verdura", "agua",
    "gaseosa", "cerveza", "yuca", "platano", "plátano", "pescado",
    "paiche", "tomate", "cebolla", "papa", "limpieza", "deterg",
    "shampoo", "jabon", "jabón", "snack", "galleta", "chocolate",
  ];
  const lower = text.toLowerCase();
  for (const k of keywords) {
    if (lower.includes(k)) return k;
  }
  return null;
}

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "STRICT", "asistente-chat"); if (_rl) return _rl;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Body inválido", issues: parsed.error.issues.slice(0, 3) },
      { status: 400 },
    );
  }

  const { messages } = parsed.data;
  const lastUser = messages.filter((m) => m.role === "user").at(-1);
  if (!lastUser) {
    return NextResponse.json({ error: "Sin mensaje del usuario" }, { status: 400 });
  }

  // Sin AI key configurada → respuesta fallback honesta
  const provider = getActiveProvider();
  if (provider === "none") {
    return NextResponse.json({
      reply:
        "El chat IA está temporalmente desactivado. Mientras tanto, podés explorar el marketplace o escribirnos por WhatsApp para atención directa.",
      products: [],
      provider: "none",
    });
  }

  // Si la pregunta menciona un producto, buscamos en el marketplace
  const productKeyword = detectProductIntent(lastUser.content);
  let productsBlock = "";
  let productsForUi: Array<{
    name: string;
    storeName: string;
    storeSlug: string;
    price: number;
    image: string | null;
  }> = [];

  if (productKeyword) {
    try {
      const results = await searchProductsCrossTenant({
        query: productKeyword,
        limit: 5,
      });
      if (results.length > 0) {
        productsBlock =
          "\n\n[PRODUCTOS DISPONIBLES]\n" +
          results
            .map(
              (p, i) =>
                `${i + 1}. ${p.name} — S/${p.price.toFixed(2)} (${p.storeName})`,
            )
            .join("\n");
        productsForUi = results.map((p) => ({
          name: p.name,
          storeName: p.storeName,
          storeSlug: p.storeSlug,
          price: p.price,
          image: p.image,
        }));
      }
    } catch (err) {
      logger.warn("[asistente/chat] product search failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Construir el prompt: system + historia reciente + productos si hay
  const conversation = messages
    .map((m) => `${m.role === "user" ? "Cliente" : "Asistente"}: ${m.content}`)
    .join("\n");

  try {
    const { text } = await generateText({
      model: chatModel,
      system: SYSTEM_PROMPT,
      prompt: `${conversation}${productsBlock}\n\nAsistente:`,
      maxOutputTokens: 350,
    });

    const reply = text.trim();
    return NextResponse.json({
      reply,
      products: productsForUi,
      provider,
    });
  } catch (err) {
    logger.error("[asistente/chat] model call failed", {
      error: err instanceof Error ? err.message : String(err),
      provider,
    });
    return NextResponse.json(
      {
        reply:
          "Tuve un problema momentáneo. Probá de nuevo en un segundo o escribinos por WhatsApp.",
        products: [],
        provider,
      },
      { status: 200 },
    );
  }
}
