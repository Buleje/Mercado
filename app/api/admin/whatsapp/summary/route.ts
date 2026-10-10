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
 * POST /api/admin/whatsapp/summary — resumen IA del hilo: qué pidió el
 * cliente, compromisos/montos y qué falta hacer. Para retomar conversaciones
 * largas sin releer todo (o al pasar el turno a otro cajero).
 */

const BodySchema = z.object({ phone: z.string().regex(/^\d{8,15}$/) });

export async function POST(req: NextRequest) {
  const _rl = applyRateLimit(req, "STRICT", "admin-whatsapp-summary");
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
    return NextResponse.json(
      { error: "IA no configurada (falta API key de un proveedor LLM)." },
      { status: 409 },
    );
  }

  try {
    const messages = await WhatsAppMessagesDB.listMessages(auth.tenantId, parsed.data.phone);
    const recent = messages.filter((m) => m.body.trim()).slice(-60);
    if (recent.length < 3) {
      return NextResponse.json({ summary: "Conversación muy corta — no hay nada que resumir todavía." });
    }

    const transcript = recent
      .map((m) => {
        const who =
          m.direction === "in" ? "Cliente" : m.sentBy === "ai" ? "Negocio (bot)" : "Negocio";
        return `${who}: ${m.body.slice(0, 300)}`;
      })
      .join("\n");

    const prompt = `Eres asistente de un negocio en Perú. Resume esta conversación de WhatsApp con un cliente para que el dueño la retome rápido:

${transcript}

Devuelve un resumen en máximo 5 líneas cortas (una por punto, con "•"), en español:
• Qué pidió/preguntó el cliente
• Montos, productos o compromisos mencionados
• Estado actual y qué falta hacer (acción concreta)
Sin encabezados ni markdown extra — solo las líneas con •.`;

    const result = await generateText({
      model: chatModel,
      prompt,
      maxOutputTokens: 300,
      temperature: 0.3,
    });

    const summary = result.text.trim().slice(0, 900);
    if (!summary) {
      return NextResponse.json({ error: "La IA no devolvió resumen." }, { status: 502 });
    }
    return NextResponse.json({ summary });
  } catch (err) {
    logger.error("[admin/whatsapp/summary] failed", {
      tenantId: auth.tenantId,
      err: String(err),
    });
    return NextResponse.json({ error: "No se pudo generar el resumen." }, { status: 502 });
  }
}
