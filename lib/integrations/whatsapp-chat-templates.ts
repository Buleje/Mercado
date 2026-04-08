import "server-only";

/**
 * lib/integrations/whatsapp-chat-templates.ts
 *
 * Templates de WhatsApp para el flujo de Chat buyer ↔ seller del Bloque D2.
 * Se envían cuando un participante responde y el otro no tiene el chat abierto.
 *
 * Principios (iguales a los del delivery):
 *   - Español peruano natural
 *   - Sólo primer nombre (privacidad)
 *   - Un link directo al hilo (endpoint público)
 *   - Mensajes < 300 chars
 *   - Emojis moderados
 */

export type ChatTemplateVars = {
  /** Primer nombre del destinatario */
  firstName: string;
  /** Nombre de la tienda */
  storeName: string;
  /** URL pública del hilo (para que el destinatario abra la conversación) */
  threadUrl: string;
};

export type SellerRespondedVars = ChatTemplateVars & {
  /** Preview del mensaje del vendedor (truncado) */
  messagePreview: string;
};

export type BuyerNewMessageVars = ChatTemplateVars & {
  /** Nombre del cliente que escribió */
  buyerFirstName: string;
  /** Preview del mensaje del cliente */
  messagePreview: string;
};

// ─── Templates ──────────────────────────────────────────────────────────────

/**
 * Evento `seller_responded` — el vendedor respondió al cliente.
 * Se envía al buyer por WhatsApp con el link público del hilo.
 */
export function sellerRespondedMessage(vars: SellerRespondedVars): string {
  return [
    `💬 *${vars.storeName}* te respondió, ${vars.firstName}`,
    ``,
    `"${vars.messagePreview}"`,
    ``,
    `Ver conversación:`,
    `${vars.threadUrl}`,
  ].join("\n");
}

/**
 * Evento `buyer_new_message` — el cliente escribió un mensaje nuevo al vendedor.
 * Se envía al dueño de la tienda (seller) cuando el chat admin no está abierto.
 */
export function buyerNewMessageMessage(vars: BuyerNewMessageVars): string {
  return [
    `📩 Nuevo mensaje de *${vars.buyerFirstName}*`,
    ``,
    `"${vars.messagePreview}"`,
    ``,
    `Responder en el panel:`,
    `${vars.threadUrl}`,
  ].join("\n");
}

/**
 * Evento `thread_closed` — el vendedor cerró la conversación.
 * Se envía al buyer para informarle que el hilo ya no acepta mensajes.
 */
export function threadClosedMessage(
  vars: ChatTemplateVars & { reason?: string },
): string {
  const reasonLine = vars.reason
    ? `\nMotivo: ${vars.reason}\n`
    : "";
  return [
    `🔒 *${vars.storeName}* cerró la conversación`,
    reasonLine,
    `Si necesitás más ayuda, abrí un chat nuevo desde la tienda:`,
    `${vars.threadUrl}`,
  ]
    .filter(Boolean)
    .join("\n");
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Construye la URL pública del hilo (para el buyer en el storefront).
 * Si el storefront todavía no tiene página dedicada, apunta al endpoint
 * del admin en el subdominio de la tienda.
 */
export function buildChatThreadUrl(baseUrl: string, storeSlug: string, threadId: string): string {
  const base = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  return `${base}/tienda/${encodeURIComponent(storeSlug)}/chat/${encodeURIComponent(threadId)}`;
}

export function firstNameOnly(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? "Cliente";
}

/**
 * Trunca el preview a N chars con ellipsis Unicode.
 */
export function previewText(body: string, maxChars = 140): string {
  if (body.length <= maxChars) return body;
  return body.slice(0, maxChars - 1) + "…";
}
