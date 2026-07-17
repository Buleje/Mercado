import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateText } from "ai";
import { chatModel, getActiveProvider } from "@/lib/ai/provider";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { logger } from "@/lib/logger";
import { WhatsAppMessagesDB } from "@/lib/db/whatsapp-messages.db";

/**
 * POST /api/admin/whatsapp/suggest — respuestas sugeridas por IA para el
 * operador (estilo Smart Reply). La IA lee el hilo de WhatsApp y propone 3
 * respuestas cortas; el humano elige/edita/envía — NUNCA se manda sola.
 * Mismo patrón que el suggest del chat interno (chatModel + fallback).
 */

const GENERIC_SUGGESTIONS = [
  "¡Hola! ¿En qué te puedo ayudar? 😊",
  "Claro, dime nomás y lo vemos.",
  "Gracias por escribir. Ya te confirmo.",
];

const BodySchema = z.object({ phone: z.string().regex(/^\d{8,15}$/) });

export async function POST(req: NextRequest) {
  const _rl = applyRateLimit(req, "STRICT", "admin-whatsapp-suggest");
  if (_rl) return _rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "phone requerido" }, { status: 400 });
  }

  if (getActiveProvider() === "none") {
    return NextResponse.json({ suggestions: GENERIC_SUGGESTIONS, source: "fallback" });
  }

  try {
    const messages = await WhatsAppMessagesDB.listMessages(auth.tenantId, parsed.data.phone);
    const recent = messages.filter((m) => m.body.trim()).slice(-14);
    if (recent.length === 0) {
      return NextResponse.json({ suggestions: GENERIC_SUGGESTIONS, source: "fallback" });
    }

    const transcript = recent
      .map((m) => {
        const who =
          m.direction === "in" ? "Cliente" : m.sentBy === "ai" ? "Negocio (bot)" : "Negocio";
        return `${who}: ${m.body.slice(0, 400)}`;
      })
      .join("\n");

    const prompt = `Eres el dueño de un negocio en Perú atendiendo a un cliente por WhatsApp. Conversación reciente:

${transcript}

Genera 3 respuestas CORTAS y distintas que el NEGOCIO podría mandar ahora, según el último mensaje del cliente.

Devuelve EXCLUSIVAMENTE un JSON válido: {"suggestions":["r1","r2","r3"]}

Reglas:
- Español de Perú, cálido y directo (tuteo). Máx 120 caracteres por respuesta, listas para enviarse tal cual.
- 3 ángulos distintos (confirmar, dar el dato pedido, ofrecer alternativa/siguiente paso).
- No inventes precios, stock ni horarios que no estén en la conversación; si falta un dato, deja la respuesta abierta.
- Máximo 1 emoji por respuesta. Solo el JSON, sin markdown.`;

    const result = await generateText({
      model: chatModel,
      prompt,
      maxOutputTokens: 400,
      temperature: 0.7,
    });

    const cleaned = result.text.trim().replace(/^```json\s*/i, "").replace(/```\s*$/i, "");
    let suggestions: string[] = [];
    try {
      const json = JSON.parse(cleaned) as { suggestions?: unknown };
      if (Array.isArray(json.suggestions)) {
        suggestions = json.suggestions
          .map((s) => String(s).trim().slice(0, 160))
          .filter(Boolean)
          .slice(0, 3);
      }
    } catch {
      /* el modelo no devolvió JSON — genéricas */
    }

    if (suggestions.length === 0) {
      return NextResponse.json({ suggestions: GENERIC_SUGGESTIONS, source: "fallback" });
    }
    return NextResponse.json({ suggestions, source: "ai" });
  } catch (err) {
    logger.error("[admin/whatsapp/suggest] failed", {
      tenantId: auth.tenantId,
      err: String(err),
    });
    return NextResponse.json({ suggestions: GENERIC_SUGGESTIONS, source: "fallback" });
  }
}
