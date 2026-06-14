import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { PlatformChatDB } from "@/lib/db/platform-chat.db";
import { logger } from "@/lib/logger";

const schema = z.object({
  mode: z.enum(["draft", "summary", "tone"]),
  conversationId: z.string().max(120).optional(),
  text: z.string().max(5000).optional(),
  tone: z.enum(["formal", "cercano", "breve"]).optional(),
});

function buildTranscript(
  messages: { senderType: string; senderName: string; body: string; isInternalNote: boolean }[],
): string {
  return messages
    .filter((m) => !m.isInternalNote)
    .slice(-15)
    .map((m) => `${m.senderType === "platform" ? "Plataforma" : "Tienda"} (${m.senderName}): ${m.body}`)
    .join("\n");
}

export async function POST(req: NextRequest) {
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
  }
  const { mode, conversationId, text, tone } = parsed.data;

  // Construir prompt según el modo.
  let system = "Sos el asistente del equipo de plataforma de Buleje (SaaS para bodegas en Perú). Respondé en español peruano, claro y profesional, con tuteo (vos no).";
  let prompt = "";
  try {
    if (mode === "draft") {
      if (!conversationId) return NextResponse.json({ error: "Falta conversationId" }, { status: 400 });
      const messages = await PlatformChatDB.getMessages(conversationId, { includeNotes: false });
      prompt = `Esta es la conversación con un dueño de tienda. Redactá la PRÓXIMA respuesta de la plataforma, lista para enviar (sin saludos genéricos repetidos, directa y útil):\n\n${buildTranscript(messages)}`;
    } else if (mode === "summary") {
      if (!conversationId) return NextResponse.json({ error: "Falta conversationId" }, { status: 400 });
      const messages = await PlatformChatDB.getMessages(conversationId, { includeNotes: false });
      system = "Resumí conversaciones de soporte de forma ejecutiva en español.";
      prompt = `Resumí esta conversación en 3-4 bullets (qué pide la tienda, qué se resolvió, qué falta):\n\n${buildTranscript(messages)}`;
    } else {
      if (!text?.trim()) return NextResponse.json({ error: "Falta texto" }, { status: 400 });
      const toneMap: Record<string, string> = {
        formal: "más formal y profesional",
        cercano: "más cercano y cálido",
        breve: "más breve y directo",
      };
      prompt = `Reescribí este mensaje en un tono ${toneMap[tone ?? "cercano"]}, manteniendo el significado. Devolvé solo el mensaje reescrito:\n\n${text}`;
    }

    // Llamada al LLM (degrada si no hay provider configurado).
    const { generateText } = await import("ai");
    const { chatModel, getActiveProvider } = await import("@/lib/ai/provider");
    const provider = getActiveProvider();
    if (!provider || provider === "none") {
      return NextResponse.json(
        { error: "IA no configurada", degraded: true, hint: "Falta ANTHROPIC_API_KEY/GROQ en el entorno." },
        { status: 503 },
      );
    }
    const result = await generateText({ model: chatModel, system, prompt });
    return NextResponse.json({ result: result.text.trim(), mode });
  } catch (e) {
    logger.error("[superadmin/chat] ai error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json(
      { error: "La IA no respondió", degraded: true },
      { status: 503 },
    );
  }
}
