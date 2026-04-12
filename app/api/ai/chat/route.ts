import { streamText } from "ai";
import { z } from "zod";
import { chatModel } from "@/lib/ai/provider";

const ChatInput = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string().min(1).max(2000),
    })
  ),
  tenantId: z.string().min(1).optional(),
});

const SYSTEM_PROMPT = `Eres el asistente de la bodega. Ayudas a clientes a encontrar productos, hacer pedidos y resolver dudas. Responde en espanol, corto y amable.
Si no sabes algo, di "No tengo esa informacion, pero puedes preguntar en la bodega."
Nunca inventes precios ni disponibilidad.`;

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = ChatInput.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      { error: "Datos invalidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { messages } = parsed.data;

  // tenantId: prefer header (set by middleware), fallback to body
  const tenantId =
    req.headers.get("x-tenant-id") ?? parsed.data.tenantId ?? "main";

  const result = streamText({
    model: chatModel,
    system: `${SYSTEM_PROMPT}\nTenant: ${tenantId}.`,
    messages,
    maxOutputTokens: 1000,
  });

  return result.toUIMessageStreamResponse();
}
