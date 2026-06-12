/**
 * lib/chat/auto-reply.ts — Tanda 3 · Bot AI-first (Brandon 2026-06-11).
 *
 * Cuando el cliente escribe y el VENDEDOR NO está en línea, el asistente IA
 * responde primero para que el cliente no quede en visto. Idea: una bodega no
 * pierde la venta por contestar 2 horas después.
 *
 * Diseño SEGURO (manda IA a clientes reales):
 *   - Opt-in: flag `marketplace-chat-autobot` arranca OFF por tenant.
 *   - Sólo si hay API key de IA (sin key → no-op).
 *   - Sólo si el vendedor NO está en línea (el humano tiene prioridad).
 *   - Sólo responde al ÚLTIMO mensaje si es del CLIENTE → el bot nunca se
 *     responde a sí mismo (sin loops).
 *   - La respuesta va marcada `metadataJson.autoReply` → la UI muestra "🤖
 *     Asistente" para no engañar al cliente.
 *   - No inventa precios/stock/horarios; deriva al dueño.
 *
 * Se dispara con `after()` (post-respuesta) desde el send público — no bloquea
 * el envío del cliente.
 */

import { generateText } from "ai";
import { chatModel, getActiveProvider } from "@/lib/ai/provider";
import { ChatMessagesDB } from "@/lib/db/chat.db";
import { readPresence } from "@/lib/chat/presence";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { logger } from "@/lib/logger";

export async function maybeAutoReply(params: {
  tenantId: string;
  threadId: string;
  storeName: string;
}): Promise<void> {
  const { tenantId, threadId, storeName } = params;
  try {
    if (!isFeatureEnabled("marketplace-chat-autobot", tenantId)) return;
    if (getActiveProvider() === "none") return;

    // El humano tiene prioridad: si el vendedor está viendo/escribiendo, no.
    const presence = readPresence(threadId, "seller");
    if (presence.online || presence.typing) return;

    const messages = await ChatMessagesDB.listByThread(tenantId, threadId, 20);
    const recent = messages.filter((m) => m.senderType !== "system" && m.body.trim()).slice(-12);
    if (recent.length === 0) return;

    // Sólo respondemos si lo último es del CLIENTE (anti-loop: el bot nunca se
    // contesta a sí mismo ni encima respuestas del vendedor).
    const last = recent[recent.length - 1];
    if (last.senderType !== "buyer") return;

    const transcript = recent
      .map((m) => `${m.senderType === "buyer" ? "Cliente" : "Tienda"}: ${m.body.slice(0, 400)}`)
      .join("\n");

    const prompt = `Sos el asistente automático de "${storeName}", una bodega/minimarket en Perú. El dueño no está disponible en este momento, así que le respondés al cliente por el chat de la tienda. Conversación:

${transcript}

Escribí UNA sola respuesta corta y útil al último mensaje del cliente.

Reglas:
- Español de Perú, cercano y cálido (tuteo: "tú tienes"). Máx 200 caracteres.
- NO inventes precios, stock ni horarios. Si el cliente los pide y no están en la conversación, decí amablemente que el dueño confirma apenas vuelva.
- Si podés ayudar con lo que ya hay en la charla, hacelo directo.
- Máximo 1 emoji. Devolvé SOLO el texto de la respuesta, sin comillas ni prefijos.`;

    const result = await generateText({
      model: chatModel,
      prompt,
      maxOutputTokens: 200,
      temperature: 0.6,
    });

    const text = result.text.trim().replace(/^["“'']+|["”'']+$/g, "").trim().slice(0, 400);
    if (!text) return;

    const msg = await ChatMessagesDB.send({
      tenantId,
      threadId,
      senderType: "seller",
      senderName: `${storeName} (asistente)`,
      body: text,
      metadataJson: JSON.stringify({ autoReply: true }),
    });

    // SSE al admin para que vea la auto-respuesta en vivo.
    try {
      const { emitAdminSSE } = await import("@/lib/sse-emitter");
      emitAdminSSE(tenantId, "chat_message_new", {
        threadId,
        senderType: "seller",
        autoReply: true,
        messageId: msg.id,
      });
    } catch {
      /* fire-and-forget */
    }

    logger.info("[chat/auto-reply] sent", { tenantId, threadId, messageId: msg.id });
  } catch (err) {
    // Nunca rompe el envío del cliente — es totalmente best-effort.
    logger.error("[chat/auto-reply] failed", { err: String(err), threadId });
  }
}
