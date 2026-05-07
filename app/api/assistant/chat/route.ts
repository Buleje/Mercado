import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { applyRateLimit } from "@/lib/rate-limit";

/**
 * POST /api/assistant/chat — Asistente Buleje (mock intent responses).
 *
 * Entrada: { productId, message, history }
 * Salida:  { reply, followUpSuggestions }
 *
 * TODO: integrar Groq AI SDK v6 con contexto del producto (descripción,
 * categoría, stock, últimas reviews) + prompt caching. Mientras tanto,
 * reglas simples por keyword en español que cubren los intents más
 * frecuentes del marketplace de Pucallpa.
 */

const HistorySchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().min(1).max(800),
});

const RequestSchema = z.object({
  productId: z.number().int().positive(),
  message: z.string().min(1).max(400),
  history: z.array(HistorySchema).max(10).optional().default([]),
});

interface IntentRule {
  keywords: string[];
  reply: string;
  followUp: string[];
}

const INTENTS: IntentRule[] = [
  {
    keywords: ["fresco", "frescura", "nuevo", "recien", "llegó", "llego"],
    reply: "Sí, este producto es de hoy. La bodega repone a primera hora, así que lo que ves ahora es lo más fresco que hay.",
    followUp: ["¿Cuánto tarda el delivery?", "¿Puedo pedir cantidad mayor?", "¿Tienen más productos frescos?"],
  },
  {
    keywords: ["descuento", "oferta", "rebaja", "barato", "promo", "promocion"],
    reply: "Este producto no tiene descuento hoy, pero mira los deals vigentes en /marketplace/ofertas — suelen rotar cada semana.",
    followUp: ["¿Cuándo hay ofertas?", "¿Tienen combo con otros productos?", "¿Hacen precio por mayor?"],
  },
  {
    keywords: ["ceviche", "cevichada", "sudado", "chilcano", "jalea", "tiradito"],
    reply: "Perfecto para ceviche, es el producto estrella para este plato. Si quieres te sumamos limón y culantro al pedido.",
    followUp: ["¿Agregan limón?", "¿Tienen ají limo?", "¿Cuánto rinde 1 kg?"],
  },
  {
    keywords: ["llega", "tarda", "demora", "delivery", "envio", "envío"],
    reply: "El delivery llega en 45–90 minutos dentro de Pucallpa (zona Centro, Yarinacocha, Manantay, Calleria). Fuera de zona coordinamos con la bodega.",
    followUp: ["¿Cobran envío?", "¿Llegan a mi zona?", "¿Puedo recoger en tienda?"],
  },
  {
    keywords: ["precio", "cuesta", "cuanto", "cuánto", "vale"],
    reply: "El precio que ves en la ficha es el de venta directa de la bodega. Si pedís cantidad mayor, el vendedor puede darte precio mayorista.",
    followUp: ["¿Hay precio por mayor?", "¿Tienen descuento por docena?", "¿Cuánto cuesta el delivery?"],
  },
  {
    keywords: ["stock", "queda", "disponible", "hay", "quedan"],
    reply: "Sí, hay stock disponible. La bodega actualiza el inventario en tiempo real, así que lo que ves es lo que tienes.",
    followUp: ["¿Cuándo reponen?", "¿Puedo reservar?", "¿Cuántas unidades max?"],
  },
  {
    keywords: ["pago", "yape", "plin", "efectivo", "tarjeta"],
    reply: "Pagás con Yape, Plin, tarjeta o efectivo contra entrega. Todo lo elegís en el checkout antes de confirmar.",
    followUp: ["¿Aceptan Plin?", "¿Cobran por Yape?", "¿Dan factura?"],
  },
];

const DEFAULT_SUGGESTIONS = [
  "¿Cómo hago para pagar?",
  "¿A qué zonas entregan?",
  "¿Tienen más de este producto?",
];

const DEFAULT_REPLY =
  "Buena pregunta, te confirmo con la bodega. ¿Hay algo más en qué pueda ayudarte mientras tanto?";

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function matchIntent(message: string): IntentRule | null {
  const norm = normalize(message);
  for (const rule of INTENTS) {
    for (const kw of rule.keywords) {
      if (norm.includes(normalize(kw))) return rule;
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "STRICT", "assistant-chat"); if (_rl) return _rl;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const { message } = parsed.data;
  const intent = matchIntent(message);

  const reply = intent?.reply ?? DEFAULT_REPLY;
  const followUpSuggestions = intent?.followUp ?? DEFAULT_SUGGESTIONS;

  return NextResponse.json(
    {
      reply,
      followUpSuggestions,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
