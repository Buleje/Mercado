import "server-only";
import { z } from "zod";
import { logger } from "@/lib/logger";
import {
  processSafeInput,
  detectPromptInjection,
} from "@/lib/ai-safety/sanitize";
import { groqProvider } from "@/lib/llm-providers/groq";

// ── Zod schemas ────────────────────────────────────────────────────────────────

const LlmItemSchema = z.object({
  nameGuess: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.string().optional(),
});

const LlmExtractionSchema = z.object({
  intent: z.enum(["order", "query", "unknown"]),
  items: z.array(LlmItemSchema).default([]),
  notes: z.string().optional(),
});

type LlmExtraction = z.infer<typeof LlmExtractionSchema>;

export interface ResolvedItem {
  nameGuess: string;
  quantity: number;
  unit?: string;
  matchedName?: string; // producto resuelto en catálogo
}

export interface DraftOrder {
  tenantId: string;
  intent: "order" | "query" | "unknown";
  items: ResolvedItem[];
  unresolved: ResolvedItem[]; // items que no matchearon ningún producto
  notes?: string;
  rawText: string;
}

// ── Prompt del extractor ───────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Eres un extractor de pedidos para una bodega peruana en WhatsApp.
Recibes texto transcrito de un audio de cliente y debes devolver SOLO JSON válido.

Formato de respuesta:
{
  "intent": "order" | "query" | "unknown",
  "items": [{"nameGuess": "arroz", "quantity": 2, "unit": "kg"}],
  "notes": "texto libre si hay instrucción especial"
}

Reglas:
- intent="order" si el cliente pide productos ("quiero", "dame", "mándame", "necesito")
- intent="query" si solo pregunta precios o disponibilidad
- intent="unknown" si no es claro
- items solo si intent="order" o intent="query"
- quantity siempre número positivo (convierte "dos" → 2, "media docena" → 6)
- unit es opcional ("kg", "litros", "bolsas", "botellas", "unidades")
- Si no hay items claros: items=[]
- NINGÚN texto fuera del JSON`;

/**
 * Usa Groq LLM para extraer items de pedido desde texto transcrito.
 * Hace match aproximado contra productos del tenant vía helper inline.
 */
export async function extractOrderFromText(
  text: string,
  tenantId: string,
  productCatalog?: { id: string; name: string }[],
): Promise<DraftOrder> {
  const groqApiKey = process.env.GROQ_API_KEY ?? "";
  if (!groqApiKey) {
    throw new Error("[voice/order-extractor] GROQ_API_KEY no configurado");
  }

  // F5 Sanitización anti-injection: texto transcrito puede contener cualquier cosa
  const injectionCheck = detectPromptInjection(text);
  if (injectionCheck.severity === "high") {
    logger.warn("[voice/order-extractor] prompt injection en transcripción", {
      tenantId,
      snippet: text.slice(0, 60),
    });
    return {
      tenantId,
      intent: "unknown",
      items: [],
      unresolved: [],
      rawText: text,
    };
  }
  const safeText = processSafeInput(text);

  // ── Llamada LLM ─────────────────────────────────────────────────────────────
  let extraction: LlmExtraction = { intent: "unknown", items: [] };

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${groqApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // Del registro: un slug tipeado acá se cae en silencio cuando Groq
        // da de baja el modelo, y el dictado queda sin extraer nada.
        model: groqProvider.models.balanced,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `Texto del cliente: "${safeText}"\n\nResponde con el JSON.`,
          },
        ],
        max_tokens: 400,
        temperature: 0.1,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      logger.warn("[voice/order-extractor] Groq error", {
        status: res.status,
        detail: detail.slice(0, 200),
      });
    } else {
      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = json.choices?.[0]?.message?.content ?? "";
      const match = content.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = LlmExtractionSchema.safeParse(JSON.parse(match[0]));
        if (parsed.success) {
          extraction = parsed.data;
        } else {
          logger.warn("[voice/order-extractor] LLM schema mismatch", {
            issues: parsed.error.issues.slice(0, 3),
          });
        }
      }
    }
  } catch (err) {
    logger.error("[voice/order-extractor] Error llamando Groq", {
      error: err instanceof Error ? err.message : String(err),
      tenantId,
    });
  }

  // ── Match aproximado contra catálogo ─────────────────────────────────────────
  const items: ResolvedItem[] = [];
  const unresolved: ResolvedItem[] = [];

  for (const item of extraction.items) {
    const matched = findProductMatch(item.nameGuess, productCatalog ?? []);
    const resolved: ResolvedItem = {
      nameGuess: item.nameGuess,
      quantity: item.quantity,
      unit: item.unit,
      matchedName: matched?.name,
    };

    if (matched) {
      items.push(resolved);
    } else {
      unresolved.push(resolved);
    }
  }

  logger.info("[voice/order-extractor] Extracción completada", {
    tenantId,
    intent: extraction.intent,
    itemsResolved: items.length,
    itemsUnresolved: unresolved.length,
  });

  return {
    tenantId,
    intent: extraction.intent,
    items,
    unresolved,
    notes: extraction.notes,
    rawText: text,
  };
}

// ── Helper de búsqueda aproximada ─────────────────────────────────────────────

/**
 * Match simple por substring case-insensitive.
 * Suficiente para bodega pequeña con < 500 productos.
 * Busca primero coincidencia exacta, luego parcial.
 */
function findProductMatch(
  nameGuess: string,
  catalog: { id: string; name: string }[],
): { id: string; name: string } | undefined {
  if (catalog.length === 0) return undefined;

  const needle = nameGuess.toLowerCase().trim();

  // 1. Coincidencia exacta
  const exact = catalog.find((p) => p.name.toLowerCase() === needle);
  if (exact) return exact;

  // 2. El nombre del producto contiene el guess
  const forward = catalog.find((p) => p.name.toLowerCase().includes(needle));
  if (forward) return forward;

  // 3. El guess contiene el nombre del producto (e.g. "arroz graneado" → "arroz")
  const reverse = catalog.find((p) => needle.includes(p.name.toLowerCase()));
  return reverse;
}
