"use server";
import { logger } from "@/lib/logger";
import { sanitizeForLLM, detectPromptInjection, moderateLLMOutput } from "@/lib/ai-safety";
import { chatCompletion, getActiveProvider } from "@/lib/ai-config";
import { ProductsDB } from "@/lib/db/products.db";

/**
 * Genera respuesta IA para mensajes de WhatsApp que no son comandos.
 * Usa el sistema multi-provider (Groq → Google Gemini → xAI Grok).
 * Incluye inventario real cuando el cliente pregunta por productos.
 */
export async function generateAIResponse(
  customerMessage: string,
  customerName: string,
  context: {
    recentProducts?: string[];
    hasOpenOrder?: boolean;
    hasFiado?: boolean;
  }
): Promise<string> {
  const provider = getActiveProvider();
  if (!provider) {
    return fallbackResponse(customerMessage);
  }

  // ── Safety check ───────────────────────────────────────────────────────────
  const sanitizedMessage = sanitizeForLLM(customerMessage, 500);
  const injectionCheck = detectPromptInjection(sanitizedMessage);
  if (injectionCheck.isInjection && injectionCheck.severity === "high") {
    logger.warn("[whatsapp-ai] Injection blocked", { customer: customerName });
    return "Solo puedo ayudarte con consultas sobre productos, pedidos y delivery. ¿En qué te puedo ayudar?";
  }

  try {
    // ── Search real inventory if asking about products ─────────────────────
    let inventoryContext = "";
    const lower = sanitizedMessage.toLowerCase();
    const productKeywords = ["precio", "cuanto", "cuesta", "tienen", "hay", "stock", "disponible", "busco"];
    if (productKeywords.some(k => lower.includes(k))) {
      try {
        const allProducts = await ProductsDB.getAll();
        const active = allProducts.filter(p => p.active !== false);
        // Find matching products by keyword
        const terms = lower.split(/\s+/).filter(t => t.length >= 3);
        const matches = active
          .filter(p => {
            const pName = p.name.toLowerCase();
            return terms.some(t => pName.includes(t));
          })
          .slice(0, 5);
        if (matches.length > 0) {
          inventoryContext = `\nPRODUCTOS ENCONTRADOS EN NUESTRO INVENTARIO:\n${matches.map(p =>
            `- ${p.name}: S/${(p.price ?? 0).toFixed(2)} ${p.stock != null ? (p.stock > 0 ? `(${p.stock} disponibles)` : "(AGOTADO)") : ""}`
          ).join("\n")}`;
        }
      } catch { /* continue without inventory */ }
    }

    const systemPrompt = `Eres el asistente virtual de Buleje, una bodega familiar en Pucallpa, Perú.
Responde en español informal pero respetuoso. Máximo 3 oraciones.
Productos que vendemos: abarrotes, frutas, verduras, carnes, lácteos, bebidas, limpieza.
${inventoryContext ? inventoryContext + "\nUsa estos precios REALES para responder." : 'Si preguntan precio de algo específico, di "Escribe PRECIO seguido del producto, por ejemplo: PRECIO arroz"'}
Si quieren hacer pedido, di "Escribe PEDIDO seguido de lo que necesitas"
Si preguntan por delivery, confirma que sí hacemos delivery en Pucallpa.
${context.hasOpenOrder ? "El cliente tiene un pedido en curso." : ""}
${context.hasFiado ? "El cliente tiene fiado pendiente." : ""}
Nunca inventes precios si no los tienes en los datos. Si no sabes algo, sugiere escribir CATALOGO o llamar a la tienda.`;

    const result = await chatCompletion([
      { role: "system", content: systemPrompt },
      { role: "user", content: sanitizedMessage },
    ], { maxTokens: 200, temperature: 0.7 });

    if (!result.ok) return fallbackResponse(customerMessage);

    // ── Output moderation — filter before sending to customer ────────────
    const moderation = moderateLLMOutput(result.content);
    if (!moderation.safe) {
      logger.warn("[whatsapp-ai] Output moderation triggered", {
        customer: customerName,
        violations: moderation.violations,
      });
    }
    return moderation.output;
  } catch (err) {
    logger.warn("WhatsApp AI fallback", { error: err });
    return fallbackResponse(customerMessage);
  }
}

function fallbackResponse(msg: string): string {
  const lower = msg.toLowerCase();
  if (lower.includes("precio") || lower.includes("cuanto") || lower.includes("cuesta"))
    return "Para ver precios escribe PRECIO seguido del producto. Ejemplo: PRECIO arroz";
  if (lower.includes("pedido") || lower.includes("quiero") || lower.includes("necesito"))
    return "Para hacer un pedido escribe PEDIDO seguido de lo que necesitas. Ejemplo: PEDIDO 2 arroz 1 aceite";
  if (lower.includes("delivery") || lower.includes("envio") || lower.includes("reparto"))
    return "¡Sí hacemos delivery en Pucallpa! Escribe PEDIDO con lo que necesitas y te lo llevamos.";
  if (lower.includes("horario") || lower.includes("hora") || lower.includes("abierto"))
    return "Atendemos de 7am a 10pm todos los días. ¡Te esperamos!";
  return "No entendí tu mensaje. Escribe HOLA para ver las opciones disponibles o CATALOGO para ver nuestros productos.";
}
