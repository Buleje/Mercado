// Tipos cliente del Messenger superadmin. Espejo de lib/db/platform-chat.db.ts
// (que es server-only y no se puede importar en un componente cliente).

export type PlatformSenderType = "platform" | "tenant" | "system";
export type PlatformConvStatus = "open" | "closed" | "archived";
export type PlatformPriority = "low" | "medium" | "high";

export interface PlatformConversation {
  id: string;
  tenantId: string;
  tenantName: string;
  subject: string | null;
  status: PlatformConvStatus;
  priority: PlatformPriority;
  assignedTo: string | null;
  labels: string[];
  unreadForPlatform: number;
  unreadForTenant: number;
  lastMessageAt: string | null;
  lastMessageText: string | null;
  lastSenderType: PlatformSenderType | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformMessage {
  id: string;
  conversationId: string;
  tenantId: string;
  senderType: PlatformSenderType;
  senderName: string;
  senderId: string | null;
  body: string;
  messageType: string;
  attachmentUrl: string | null;
  isInternalNote: boolean;
  metadataJson: string | null;
  readByPlatformAt: string | null;
  readByTenantAt: string | null;
  createdAt: string;
}

export const PRIORITY_META: Record<PlatformPriority, { label: string; dot: string }> = {
  high: { label: "Alta", dot: "bg-[var(--data-error-500,#ef4444)]" },
  medium: { label: "Media", dot: "bg-[var(--data-warning-500,#f59e0b)]" },
  low: { label: "Baja", dot: "bg-[var(--text-tertiary)]" },
};

// Plantillas de respuesta rápida (variables {tienda} se resuelven al insertar).
export const QUICK_TEMPLATES: { label: string; body: string }[] = [
  { label: "Bienvenida", body: "Hola {tienda} 👋 Soy del equipo de Buleje. ¿En qué te puedo ayudar hoy?" },
  { label: "Pago pendiente", body: "Hola {tienda}, te escribo por el pago de tu plan. ¿Querés que te pase el link de Yape para regularizarlo?" },
  { label: "Seguimiento", body: "Hola {tienda}, ¿pudiste revisar lo que conversamos? Quedo atento para ayudarte." },
  { label: "Cierre", body: "¡Listo {tienda}! Cualquier otra cosa que necesites, escribime por acá. Que vendas mucho." },
];
