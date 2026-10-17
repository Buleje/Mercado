import type { GiftCardDetails } from "./GiftCardDetailsModal";

// ADR-077: cargar data real desde el backend.
export type AdminStats = {
  vendidas30d: number;
  ingreso30d: number;
  canjeadas30d: number;
  saldoPendiente: number;
  totalActivas: number;
  totalCanceladas: number;
};

export type ApiGiftCard = {
  id: string;
  code: string; // masked "****-****-****-XXXX"
  amount: number;
  balance: number;
  recipientName: string;
  recipientContact?: string;
  senderName?: string;
  message?: string;
  status: "activa" | "canjeada" | "expirada";
  createdAt: string;
  expiresAt?: string | null;
  redeemedAt?: string | null;
};

export function toGiftCardDetails(card: ApiGiftCard): GiftCardDetails {
  const statusMap: Record<string, GiftCardDetails["status"]> = {
    activa: "pendiente",
    canjeada: "canjeada",
    expirada: "expirada",
  };
  return {
    id: card.id,
    code: card.code,
    amount: card.amount,
    balance: card.balance,
    recipientName: card.recipientName,
    recipientPhone: card.recipientContact,
    senderName: card.senderName ?? "",
    message: card.message ?? "",
    status: statusMap[card.status] ?? "pendiente",
    createdAt: card.createdAt,
    expiresAt: card.expiresAt ?? "",
    redeemedAt: card.redeemedAt ?? undefined,
  };
}
