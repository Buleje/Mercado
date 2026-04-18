import "server-only";
import {
  MOCK_GIFT_CARDS,
  MOCK_GIFT_CARD_USAGE,
  type MockGiftCard,
  type MockGiftCardUsage,
  type GiftCardDesign,
} from "@/lib/mocks/gift-cards.mock";

/**
 * lib/db/gift-cards.db.ts — Agent E (Gift Cards Marketplace)
 *
 * Clase de acceso a datos para Tarjetas de Regalo Buleje.
 *
 * Estado actual: MOCK en memoria. La tabla Prisma `GiftCard` no existe todavia
 * (zona peligrosa — requiere migration). El contrato publico (firma de metodos)
 * esta diseniado para ser reemplazado 1:1 cuando se haga la migration.
 *
 * CLAUDE.md:
 *   #3 tenantId primer param
 *   #6 totales en backend
 *   #7 fire-and-forget para tareas no criticas
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type DbGiftCard = MockGiftCard;
export type DbGiftCardUsage = MockGiftCardUsage;

export type PurchaseInput = {
  tenantId: string;
  senderUserId: string;
  senderName: string;
  amount: number;
  design: GiftCardDesign;
  message: string;
  recipientName: string;
  recipientContact: string;
  contactMethod: "email" | "whatsapp";
};

export type RedeemResult =
  | { ok: true; giftCard: DbGiftCard }
  | { ok: false; error: "NOT_FOUND" | "ALREADY_REDEEMED" | "EXPIRED" | "NO_BALANCE" };

// ── In-memory "repository" ───────────────────────────────────────────────────

// Clonamos la fixture para que cada llamada no mute la exportada.
let giftCards: DbGiftCard[] = MOCK_GIFT_CARDS.map((g) => ({ ...g }));
let usage: DbGiftCardUsage[] = MOCK_GIFT_CARD_USAGE.map((u) => ({ ...u }));

function randomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const block = () =>
    Array.from({ length: 4 }, () =>
      alphabet.charAt(Math.floor(Math.random() * alphabet.length)),
    ).join("");
  return `BULJ-${block()}-${block()}`;
}

function randomId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

// ── Public API ───────────────────────────────────────────────────────────────

export const GiftCardsDB = {
  /** Tarjetas recibidas por un usuario. */
  async listReceivedForUser(
    tenantId: string,
    userId: string,
  ): Promise<DbGiftCard[]> {
    return giftCards
      .filter((g) => g.tenantId === tenantId && g.redeemedByUserId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((g) => ({ ...g }));
  },

  /** Tarjetas enviadas por un usuario. */
  async listSentByUser(
    tenantId: string,
    userId: string,
  ): Promise<DbGiftCard[]> {
    return giftCards
      .filter((g) => g.tenantId === tenantId && g.senderUserId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((g) => ({ ...g }));
  },

  /** Historial de uso del saldo de una gift card (propia o canjeada). */
  async listUsageForUser(
    tenantId: string,
    userId: string,
  ): Promise<DbGiftCardUsage[]> {
    return usage
      .filter((u) => u.tenantId === tenantId && u.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((u) => ({ ...u }));
  },

  /**
   * Comprar una tarjeta. Retorna la tarjeta creada.
   * Mock: no descuenta del metodo de pago real.
   */
  async purchase(input: PurchaseInput): Promise<DbGiftCard> {
    const now = new Date().toISOString();
    const card: DbGiftCard = {
      id: randomId("gc"),
      code: randomCode(),
      tenantId: input.tenantId,
      amount: input.amount,
      balance: input.amount,
      design: input.design,
      message: input.message.slice(0, 200),
      senderName: input.senderName,
      senderUserId: input.senderUserId,
      recipientName: input.recipientName,
      recipientContact: input.recipientContact,
      contactMethod: input.contactMethod,
      status: "activa",
      createdAt: now,
      redeemedAt: null,
      redeemedByUserId: null,
      expiresAt: null,
    };
    giftCards.unshift(card);
    return { ...card };
  },

  /**
   * Canjear una tarjeta (marcar como recibida por un usuario).
   * No descuenta saldo todavia — solo asocia al destinatario.
   */
  async redeem(
    tenantId: string,
    code: string,
    userId: string,
  ): Promise<RedeemResult> {
    const card = giftCards.find(
      (g) => g.tenantId === tenantId && g.code.toUpperCase() === code.toUpperCase(),
    );
    if (!card) return { ok: false, error: "NOT_FOUND" };
    if (card.redeemedByUserId && card.redeemedByUserId !== userId) {
      return { ok: false, error: "ALREADY_REDEEMED" };
    }
    if (card.status === "expirada") return { ok: false, error: "EXPIRED" };
    if (card.balance <= 0) return { ok: false, error: "NO_BALANCE" };
    card.redeemedByUserId = userId;
    card.redeemedAt = card.redeemedAt ?? new Date().toISOString();
    return { ok: true, giftCard: { ...card } };
  },

  /** Validar codigo sin canjear (para el flujo de checkout). */
  async validateCode(
    tenantId: string,
    code: string,
  ): Promise<{ ok: true; balance: number } | { ok: false; error: string }> {
    const card = giftCards.find(
      (g) => g.tenantId === tenantId && g.code.toUpperCase() === code.toUpperCase(),
    );
    if (!card) return { ok: false, error: "Tarjeta no encontrada" };
    if (card.balance <= 0) return { ok: false, error: "Sin saldo disponible" };
    if (card.status === "expirada") return { ok: false, error: "Tarjeta expirada" };
    return { ok: true, balance: card.balance };
  },

  /**
   * Helpers internos para tests / reset.
   * @internal
   */
  __reset(): void {
    giftCards = MOCK_GIFT_CARDS.map((g) => ({ ...g }));
    usage = MOCK_GIFT_CARD_USAGE.map((u) => ({ ...u }));
  },
};
