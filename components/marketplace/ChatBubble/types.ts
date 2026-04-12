/**
 * Tipos del widget ChatBubble del storefront.
 * Shape segura (no expone tenantId, nunca apellido completo, nunca metadata interno).
 */

export type PublicThreadView = {
  threadId: string;
  storeName: string;
  status: "open" | "closed" | "archived" | "blocked";
  unreadForBuyer: number;
  createdAt: string;
};

export type PublicMessageView = {
  id: string;
  senderType: "buyer" | "seller" | "system";
  senderName: string;
  body: string;
  messageType: "text" | "image" | "system_event" | "quote" | "order_link";
  attachmentUrl: string | null;
  createdAt: string;
};

/**
 * Datos persistidos del buyer en localStorage para que la conversación
 * sobreviva refreshes. Clave: `buleje-chat-${storeSlug}`.
 */
export type ChatBubbleSession = {
  threadId: string;
  customerPhone: string;
  customerName: string;
};
