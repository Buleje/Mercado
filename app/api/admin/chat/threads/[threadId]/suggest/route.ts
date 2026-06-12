import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { chatModel, getActiveProvider } from "@/lib/ai/provider";
import { requireAdmin } from "@/lib/require-admin";
import { ChatMessagesDB } from "@/lib/db/chat.db";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { logger } from "@/lib/logger";

/**
 * POST /api/admin/chat/threads/[threadId]/suggest — Tanda 3 · Respuestas
 * sugeridas por IA (Brandon 2026-06-11).
 *
 * El vendedor toca "✨" y el asistente propone 3 respuestas cortas listas para
 * enviar, en base al hilo. Estilo Gmail Smart Reply. Reusa `chatModel`
 * (Haiku 4.5 → Groq llama gratis de fallback). NO envía nada solo: el vendedor
 * elige una, la edita si quiere, y recién ahí la manda.
 *
 * Costo: on-demand (no se llama en cada mensaje). Rate limit STRICT.
 */

/** Fallback cuando no hay API key o el modelo falla — la UI nunca se rompe. */
const GENERIC_SUGGESTIONS = [
  "¡Hola! ¿En qué te puedo ayudar? 😊",
  "Claro, dime nomás y lo vemos.",
  "Gracias por escribir. Ya te confirmo.",
];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const _rl = await applyRateLimit(req, "STRICT", "admin-chat-suggest"); if (_rl) return _rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  const { threadId } = await params;

  // Sin API key configurada — devolvemos genéricas sin gastar nada.
  if (getActiveProvider() === "none") {
    return NextResponse.json({ data: { suggestions: GENERIC_SUGGESTIONS, source: "fallback" } });
  }

  try {
    const messages = await ChatMessagesDB.listByThread(auth.tenantId, threadId, 30);
    const recent = messages
      .filter((m) => m.senderType !== "system" && m.body.trim())
      .slice(-14);

    if (recent.length === 0) {
      return NextResponse.json({ data: { suggestions: GENERIC_SUGGESTIONS, source: "fallback" } });
    }

    // Transcripción compacta: Cliente / Tienda.
    const transcript = recent
      .map((m) => `${m.senderType === "buyer" ? "Cliente" : "Tienda"}: ${m.body.slice(0, 400)}`)
      .join("\n");

    const prompt = `Sos el dueño de una bodega/minimarket en Perú respondiendo a un cliente por el chat de tu tienda. Acá está la conversación reciente:

${transcript}

Generá 3 respuestas CORTAS y distintas que la TIENDA podría mandar ahora, en base al último mensaje del cliente.

Devolvé EXCLUSIVAMENTE un JSON válido con esta forma:
{"suggestions":["r1","r2","r3"]}

Reglas:
- Español de Perú, natural y cercano (tuteo: "tú tienes", no "vos tenés"). Estilo bodega de barrio, cálido pero directo.
- Máx 120 caracteres por respuesta. Que sirvan para enviarse tal cual.
- 3 ángulos distintos (ej: confirmar, dar precio/stock, ofrecer alternativa).
- No inventes precios, stock ni horarios que no estén en la conversación; si hace falta un dato, dejá la respuesta abierta ("déjame confirmarte el stock").
- Máximo 1 emoji por respuesta, solo si suma.
- Solo el JSON, sin markdown ni texto extra.`;

    const result = await generateText({
      model: chatModel,
      prompt,
      maxOutputTokens: 400,
      temperature: 0.7,
    });

    const raw = result.text.trim().replace(/^```json\s*/i, "").replace(/```\s*$/i, "");
    let suggestions: string[] = [];
    try {
      const parsed = JSON.parse(raw) as { suggestions?: unknown };
      if (Array.isArray(parsed.suggestions)) {
        suggestions = parsed.suggestions
          .map((s) => String(s).trim().slice(0, 160))
          .filter(Boolean)
          .slice(0, 3);
      }
    } catch {
      // El modelo no devolvió JSON — caemos a genéricas.
    }

    if (suggestions.length === 0) {
      return NextResponse.json({ data: { suggestions: GENERIC_SUGGESTIONS, source: "fallback" } });
    }

    return NextResponse.json({ data: { suggestions, source: "ai" } });
  } catch (err) {
    logger.error("[chat/suggest] failed", { err: String(err), threadId });
    // Nunca rompemos el composer: genéricas como red de seguridad.
    return NextResponse.json({ data: { suggestions: GENERIC_SUGGESTIONS, source: "fallback" } });
  }
}
