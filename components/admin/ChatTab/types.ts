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
  /** Tanda 3: etiquetas de triage del vendedor. */
  labels: string[];
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
  open: "bg-[#00A0A0]",
  closed: "bg-slate-500",
  archived: "bg-slate-400",
  blocked: "bg-[var(--data-error-500)]",
};

export const SENDER_LABELS: Record<SenderType, string> = {
  buyer: "Cliente",
  seller: "Tienda",
  system: "Sistema",
};

/**
 * Tanda 3: etiquetas de triage preset. El vendedor las aplica desde el panel
 * de la conversación; la bandeja se filtra por ellas. `chip` pinta el badge.
 */
export interface ThreadLabelPreset {
  name: string;
  /** Clases del badge (texto + fondo, light + dark). */
  chip: string;
}

export const THREAD_LABEL_PRESETS: ThreadLabelPreset[] = [
  { name: "Nuevo",     chip: "bg-[var(--data-info-100)] text-[var(--data-info-700)]" },
  { name: "Pagado",    chip: "bg-[var(--data-success-100)] text-[var(--data-success-700)]" },
  { name: "Reclamo",   chip: "bg-[var(--data-error-100)] text-[var(--data-error-700)]" },
  { name: "Pendiente", chip: "bg-[var(--data-warning-100)] text-[var(--data-warning-700)]" },
  { name: "VIP",       chip: "bg-primary/15 text-primary" },
];

/** Estilo del badge para una etiqueta (preset o custom → estilo neutro). */
export function labelChipClass(name: string): string {
  return (
    THREAD_LABEL_PRESETS.find((p) => p.name.toLowerCase() === name.toLowerCase())?.chip ??
    "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
  );
}
