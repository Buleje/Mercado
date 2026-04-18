/**
 * Tipos compartidos del ChatTab.
 * Reflejan los DTOs de /api/admin/chat/* (ver lib/db/chat.db.ts).
 */

export type ThreadStatus = "open" | "closed" | "archived" | "blocked";
export type SenderType = "buyer" | "seller" | "system";
export type MessageType = "text" | "image" | "system_event" | "quote" | "order_link";

export interface ChatThreadView {
  id: string;
  tenantId: string;
  storeId: string;
  orderId: string | null;
  customerPhone: string;
  customerName: string;
  subject: string | null;
  status: ThreadStatus;
  unreadForBuyer: number;
  unreadForSeller: number;
  lastMessageAt: string | null;
  lastMessageText: string | null;
  lastSenderType: SenderType | null;
  closedAt: string | null;
  closedReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessageView {
  id: string;
  tenantId: string;
  threadId: string;
  senderType: SenderType;
  senderId: string | null;
  senderName: string;
  body: string;
  messageType: MessageType;
  attachmentUrl: string | null;
  metadataJson: string | null;
  readByBuyerAt: string | null;
  readBySellerAt: string | null;
  deletedAt: string | null;
  createdAt: string;
}

export const STATUS_LABELS: Record<ThreadStatus, string> = {
  open: "Abierto",
  closed: "Cerrado",
  archived: "Archivado",
  blocked: "Bloqueado",
};

export const STATUS_COLORS: Record<ThreadStatus, string> = {
  open: "bg-[#00B4A6]",
  closed: "bg-slate-500",
  archived: "bg-slate-400",
  blocked: "bg-[var(--data-error)]",
};

export const SENDER_LABELS: Record<SenderType, string> = {
  buyer: "Cliente",
  seller: "Tienda",
  system: "Sistema",
};
