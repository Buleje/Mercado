"use server";
import { logger } from "@/lib/logger";

/**
 * Genera respuesta IA para mensajes de WhatsApp que no son comandos.
 * Usa Groq (GROQ_API_KEY) como proveedor primario, fallback a respuesta predefinida.
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
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    return fallbackResponse(customerMessage);
  }

  try {
    const systemPrompt = `Eres el asistente virtual de Buleje, una bodega familiar en Pucallpa, Perú.
Responde en español informal pero respetuoso. Máximo 3 oraciones.
Productos que vendemos: abarrotes, frutas, verduras, carnes, lácteos, bebidas, limpieza.
Si preguntan precio de algo específico, di "Escribe PRECIO seguido del producto, por ejemplo: PRECIO arroz"
Si quieren hacer pedido, di "Escribe PEDIDO seguido de lo que necesitas"
Si preguntan por delivery, confirma que sí hacemos delivery en Pucallpa.
${context.hasOpenOrder ? "El cliente tiene un pedido en curso." : ""}
${context.hasFiado ? "El cliente tiene fiado pendiente." : ""}
Nunca inventes precios. Si no sabes algo, sugiere escribir CATALOGO o llamar a la tienda.`;

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${groqKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: customerMessage },
        ],
        max_tokens: 200,
        temperature: 0.7,
      }),
    });

    if (!res.ok) return fallbackResponse(customerMessage);
    const data = await res.json() as { choices?: { message?: { content?: string } }[] };
    return data.choices?.[0]?.message?.content ?? fallbackResponse(customerMessage);
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
