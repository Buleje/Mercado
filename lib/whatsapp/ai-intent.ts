import "server-only";
import { generateText } from "ai";
import { z } from "zod";
import { chatModel } from "@/lib/ai/provider";
import { logger } from "@/lib/logger";

export const WhatsappIntent = z.enum([
  "saludo",
  "catalogo",
  "precio",
  "pedido",
  "confirmar",
  "estado",
  "pago",
  "humano",
  "recomendar",
  "desconocido",
]);
export type WhatsappIntent = z.infer<typeof WhatsappIntent>;

const ExtractedItem = z.object({
  name: z.string().min(1),
  quantity: z.number().int().positive().max(999),
  unit: z.string().optional(),
});

const ClassificationSchema = z.object({
  intent: WhatsappIntent,
  confidence: z.number().min(0).max(1),
  items: z.array(ExtractedItem).optional(),
  productQuery: z.string().optional(),
});
export type Classification = z.infer<typeof ClassificationSchema>;

const FALLBACK: Classification = { intent: "desconocido", confidence: 0 };

const SYSTEM_PROMPT = `Eres un clasificador de intenciones para un marketplace peruano (Pucallpa) en WhatsApp.
Recibes un mensaje del cliente y devuelves SOLO un JSON valido con esta forma:
{
  "intent": "saludo" | "catalogo" | "precio" | "pedido" | "confirmar" | "estado" | "pago" | "humano" | "recomendar" | "desconocido",
  "confidence": 0.0-1.0,
  "items": [{"name":"arroz","quantity":2,"unit":"kg"}],
  "productQuery": "texto del producto consultado"
}

Reglas:
- "saludo" si dice "hola", "buenas", "hey", "ola"
- "catalogo" si pregunta que venden, que hay, ver productos, ver tiendas, mostrar menu
- "precio" si pregunta cuanto cuesta o busca un producto especifico ("tienen leche?", "cuanto la coca cola")
- "pedido" solo si pide productos concretos ("quiero", "dame", "mandame", "pidame 2 kilos de arroz")
- "confirmar" si dice "si", "confirmo", "dale", "ok confirmo", "ya pe"
- "estado" si pregunta por su orden actual ("donde esta mi pedido", "ya llego", "que paso con mi pedido")
- "pago" si pregunta como pagar o menciona yape/efectivo/tarjeta
- "humano" si pide hablar con una persona real / asesor / vendedor
- "recomendar" si pide consejo o sugerencia ("que me recomiendas", "algo barato para la cena", "que sirve para una parrilla", "que tienen rico", "necesito algo para gripe", "ideas para regalo")
- items SOLO si intent == "pedido"
- productQuery SOLO si intent == "precio" o "recomendar"
- Si no estas seguro: "desconocido" con confidence < 0.4
- Ningun texto fuera del JSON`;

/**
 * Classify a free-text WhatsApp message into a structured intent using the LLM.
 * Falls back to { intent: "desconocido" } on any error — the caller is
 * expected to route "desconocido" to the existing keyword-based engine.
 */
export async function classifyWhatsappIntent(
  message: string,
): Promise<Classification> {
  const trimmed = message.trim();
  if (trimmed.length === 0 || trimmed.length > 500) return FALLBACK;

  try {
    const { text } = await generateText({
      model: chatModel,
      system: SYSTEM_PROMPT,
      prompt: `Mensaje del cliente: "${trimmed}"\n\nResponde con el JSON.`,
      maxOutputTokens: 300,
    });

    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      logger.warn("[whatsapp-ai-intent] no JSON in response");
      return FALLBACK;
    }

    const parsed = ClassificationSchema.safeParse(JSON.parse(match[0]));
    if (!parsed.success) {
      logger.warn("[whatsapp-ai-intent] schema mismatch", {
        issues: parsed.error.issues.slice(0, 3),
      });
      return FALLBACK;
    }
    return parsed.data;
  } catch (err) {
    logger.error("[whatsapp-ai-intent] classification failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return FALLBACK;
  }
}

/**
 * Decide whether the AI classification is confident enough to drive the
 * conversation, or whether to hand off to the keyword-based state machine.
 */
export function shouldTrustAi(c: Classification): boolean {
  return c.intent !== "desconocido" && c.confidence >= 0.6;
}
