import "server-only";
import { prisma } from "@/lib/prisma";
import { getOrSet, invalidateByPrefix } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { logActivity } from "@/lib/activity-logger";
import { toNumOrZero } from "@/lib/decimal-utils";
import {
  generateCode,
  hashCode,
  codeLast4,
  maskFromLast4,
  normalizeCode,
  isPlausibleCode,
} from "@/lib/gift-cards/code-utils";
import type {
  MockGiftCard,
  MockGiftCardUsage,
  GiftCardDesign as MockGiftCardDesign,
  GiftCardStatus as MockGiftCardStatus,
} from "@/lib/mocks/gift-cards.mock";

/**
 * lib/db/gift-cards.db.ts — ADR-077
 *
 * Clase de acceso a datos para Tarjetas de Regalo Buleje (Prisma real).
 *
 * SEGURIDAD: el codigo plano NUNCA se persiste. La tabla `gift_cards` solo
 * guarda `codeHash` (HMAC-SHA256) + `codeLast4` (para UI masked). El plain
 * code se devuelve UNA sola vez en `purchase()` — el caller lo muestra al
 * sender y se pierde despues.
 *
 * CLAUDE.md compliance:
 *   #1 — DB class, no prisma directo desde fuera
 *   #3 — tenantId primer parametro en TODO metodo
 *   #5 — invalidateByPrefix tras writes
 *   #6 — totales en backend (balance se calcula aqui, no client-side)
 *   #7 — logActivity fire-and-forget
 *  #11 — raw SQL solo con $1/$2 (SELECT FOR UPDATE en redeem)
 *
 * Ver docs/adr/077-gift-cards-hmac-redemption.md
 */

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * Contrato publico de salida — mantiene compatibilidad con las UIs que leen
 * `MockGiftCard`. La diferencia clave: `code` aqui contiene el codigo MASKED
 * ("****-****-****-XXXX"), no el plano. El plano solo existe en el response
 * de `purchase()` via la key dedicada `plainCode`.
 */
export type DbGiftCard = MockGiftCard;
export type DbGiftCardUsage = MockGiftCardUsage;

/** Mapea enum Prisma (`anio_nuevo`) → string UI (`anio-nuevo`). */
const DESIGN_FROM_DB: Record<string, MockGiftCardDesign> = {
  cumpleanos: "cumpleanos",
  navidad: "navidad",
  felicitaciones: "felicitaciones",
  aniversario: "aniversario",
  gracias: "gracias",
  anio_nuevo: "anio-nuevo",
  bienvenida: "bienvenida",
  general: "general",
};

const DESIGN_TO_DB: Record<MockGiftCardDesign, string> = {
  cumpleanos: "cumpleanos",
  navidad: "navidad",
  felicitaciones: "felicitaciones",
  aniversario: "aniversario",
  gracias: "gracias",
  "anio-nuevo": "anio_nuevo",
  bienvenida: "bienvenida",
  general: "general",
};

/** Mapea enum status DB → status UI (compat con mock). */
function mapStatus(db: string): MockGiftCardStatus {
  if (db === "cancelled" || db === "cancelled") return "expirada";
  if (db === "fully_redeemed") return "canjeada";
  if (db === "expired") return "expirada";
  // pending_delivery | active | partially_redeemed → "activa"
  return "activa";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapGiftCardRow(row: any): DbGiftCard {
  const last4 = row.codeLast4 ?? "????";
  return {
    id: row.id,
    code: maskFromLast4(last4), // UI ve siempre masked
    tenantId: row.tenantId,
    amount: toNumOrZero(row.amountSoles),
    balance: toNumOrZero(row.balanceSoles),
    design: DESIGN_FROM_DB[row.design] ?? "general",
    message: row.dedicatoria ?? "",
    senderName: row.senderName ?? "",
    senderUserId: row.senderUserId ?? "",
    recipientName: row.recipientName,
    recipientContact: row.recipientEmail ?? row.recipientPhone ?? "",
    contactMethod: row.recipientEmail ? "email" : "whatsapp",
    status: mapStatus(row.status),
    createdAt:
      row.purchasedAt instanceof Date
        ? row.purchasedAt.toISOString()
        : String(row.purchasedAt ?? new Date().toISOString()),
    redeemedAt:
      row.firstRedeemedAt instanceof Date
        ? row.firstRedeemedAt.toISOString()
        : null,
    redeemedByUserId: row.recipientUserId ?? null,
    expiresAt:
      row.expiresAt instanceof Date ? row.expiresAt.toISOString() : null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRedemptionRow(row: any): DbGiftCardUsage {
  return {
    id: row.id,
    giftCardId: row.giftCardId,
    userId: row.userId ?? "",
    tenantId: row.tenantId,
    orderId: row.orderId ?? null,
    orderNumber: row.orderId ?? null, // no hay separacion aun; orderId = orderNumber
    amount: toNumOrZero(row.amountRedeemed),
    balanceAfter: 0, // computado en el join — la query lo llena si corresponde
    storeName: "Buleje",
    createdAt:
      row.redeemedAt instanceof Date
        ? row.redeemedAt.toISOString()
        : String(row.redeemedAt),
  };
}

// ── Cache keys ───────────────────────────────────────────────────────────────

const PREFIX_RECEIVED = (tenantId: string, userId: string) =>
  `giftcards:${tenantId}:received:${userId}`;
const PREFIX_SENT = (tenantId: string, userId: string) =>
  `giftcards:${tenantId}:sent:${userId}`;
const PREFIX_USAGE = (tenantId: string, userId: string) =>
  `giftcards:${tenantId}:usage:${userId}`;
const PREFIX_STATS = (tenantId: string) => `giftcards:${tenantId}:stats`;
const CACHE_TTL_SEC = 60; // recibidas/enviadas/usage
const STATS_TTL_SEC = 120; // admin stats

// ── Input types ──────────────────────────────────────────────────────────────

export type PurchaseInput = {
  amount: number;
  design: MockGiftCardDesign;
  message: string;
  recipientName: string;
  recipientEmail?: string | null;
  recipientPhone?: string | null;
  senderName: string;
  senderEmail?: string | null;
};

export type PurchaseResult = {
  giftCard: DbGiftCard;
  /** Codigo plano — solo disponible UNA VEZ. El caller lo muestra al sender. */
  plainCode: string;
};

export type ValidateResult =
  | {
      ok: true;
      giftCardId: string;
      amount: number;
      balance: number;
      currency: string;
      status: MockGiftCardStatus;
      recipientName: string;
      expiresAt: string | null;
    }
  | { ok: false; error: "NOT_FOUND" | "EXPIRED" | "CANCELLED" | "NO_BALANCE" | "INVALID_FORMAT" };

export type RedeemResult =
  | {
      ok: true;
      giftCard: DbGiftCard;
      redeemedAmount: number;
      balanceAfter: number;
    }
  | {
      ok: false;
      error:
        | "NOT_FOUND"
        | "EXPIRED"
        | "CANCELLED"
        | "INSUFFICIENT_BALANCE"
        | "INVALID_AMOUNT"
        | "INVALID_FORMAT";
    };

export type IssueManualInput = {
  amount: number;
  recipientName: string;
  recipientPhone?: string | null;
  recipientEmail?: string | null;
  message?: string;
  design?: MockGiftCardDesign;
  expiresAt?: Date | null;
  reason: string; // "cortesia", "compensacion demora", etc.
};

// ── Public API ───────────────────────────────────────────────────────────────

export const GiftCardsDB = {
  /**
   * Compra de una gift card por un cliente.
   * Returns: { giftCard, plainCode } — el plainCode solo se expone UNA vez.
   */
  async purchase(
    tenantId: string,
    input: PurchaseInput,
    senderUserId: string | null,
  ): Promise<PurchaseResult> {
    // Generar codigo plano + hash unico (reintentar si colisiona — muy raro)
    let plainCode = generateCode();
    let attempt = 0;
    while (attempt < 5) {
      const existing = await prisma.giftCard.findUnique({
        where: { codeHash: hashCode(plainCode) },
        select: { id: true },
      });
      if (!existing) break;
      plainCode = generateCode();
      attempt++;
    }
    if (attempt >= 5) {
      throw new Error("Failed to allocate unique gift card code after 5 attempts");
    }

    const codeHash = hashCode(plainCode);
    const last4 = codeLast4(plainCode);
    const designEnum = DESIGN_TO_DB[input.design] ?? "general";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (prisma.giftCard as any).create({
      data: {
        tenantId,
        codeHash,
        codeLast4: last4,
        amountSoles: input.amount,
        balanceSoles: input.amount,
        currency: "PEN",
        design: designEnum,
        status: "active", // tras compra queda lista para canjear
        senderName: input.senderName,
        senderEmail: input.senderEmail ?? null,
        senderUserId,
        recipientName: input.recipientName,
        recipientEmail: input.recipientEmail ?? null,
        recipientPhone: input.recipientPhone ?? null,
        dedicatoria: input.message.slice(0, 200),
      },
    });

    // Audit fire-and-forget
    logActivity(
      "gift_card_purchase",
      "GiftCard",
      `Compra ${input.amount} PEN para ${input.recipientName}`,
      row.id,
      senderUserId ?? "guest",
      undefined,
      tenantId,
    ).catch((err) => {
      logger.error("[gift-cards] activity log failed", {
        err: err instanceof Error ? err.message : String(err),
      });
    });

    // Invalidar caches del sender
    if (senderUserId) {
      invalidateByPrefix(PREFIX_SENT(tenantId, senderUserId));
    }
    invalidateByPrefix(PREFIX_STATS(tenantId));

    return { giftCard: mapGiftCardRow(row), plainCode };
  },

  /**
   * Listar gift cards que un usuario RECIBIO (donde recipientUserId = userId).
   * Incluye active + partially_redeemed + fully_redeemed del mismo user.
   */
  async listReceivedForUser(
    tenantId: string,
    userId: string,
  ): Promise<DbGiftCard[]> {
    return getOrSet(PREFIX_RECEIVED(tenantId, userId), CACHE_TTL_SEC, async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = await (prisma.giftCard as any).findMany({
        where: { tenantId, recipientUserId: userId },
        orderBy: { purchasedAt: "desc" },
      });
      return rows.map(mapGiftCardRow);
    });
  },

  /**
   * Listar gift cards que un usuario ENVIO (donde senderUserId = userId).
   */
  async listSentByUser(
    tenantId: string,
    userId: string,
  ): Promise<DbGiftCard[]> {
    return getOrSet(PREFIX_SENT(tenantId, userId), CACHE_TTL_SEC, async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = await (prisma.giftCard as any).findMany({
        where: { tenantId, senderUserId: userId },
        orderBy: { purchasedAt: "desc" },
      });
      return rows.map(mapGiftCardRow);
    });
  },

  /**
   * Historial de canjes del usuario (recibidos sobre sus propias tarjetas).
   */
  async listUsageForUser(
    tenantId: string,
    userId: string,
  ): Promise<DbGiftCardUsage[]> {
    return getOrSet(PREFIX_USAGE(tenantId, userId), CACHE_TTL_SEC, async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = await (prisma.giftCardRedemption as any).findMany({
        where: { tenantId, userId },
        orderBy: { redeemedAt: "desc" },
      });
      return rows.map(mapRedemptionRow);
    });
  },

  /**
   * Validar un codigo sin consumirlo (consulta previa al checkout).
   * NO muta estado. Rate limit fuerte en la ruta que la llama.
   */
  async validateCode(tenantId: string, plainCode: string): Promise<ValidateResult> {
    if (!isPlausibleCode(plainCode)) {
      return { ok: false, error: "INVALID_FORMAT" };
    }
    const codeHash = hashCode(plainCode);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (prisma.giftCard as any).findFirst({
      where: { tenantId, codeHash },
    });
    if (!row) return { ok: false, error: "NOT_FOUND" };
    if (row.status === "cancelled") return { ok: false, error: "CANCELLED" };
    if (row.status === "expired") return { ok: false, error: "EXPIRED" };
    if (row.expiresAt && new Date(row.expiresAt).getTime() < Date.now()) {
      return { ok: false, error: "EXPIRED" };
    }
    const balance = toNumOrZero(row.balanceSoles);
    if (balance <= 0) return { ok: false, error: "NO_BALANCE" };

    return {
      ok: true,
      giftCardId: row.id,
      amount: toNumOrZero(row.amountSoles),
      balance,
      currency: row.currency ?? "PEN",
      status: mapStatus(row.status),
      recipientName: row.recipientName,
      expiresAt: row.expiresAt ? new Date(row.expiresAt).toISOString() : null,
    };
  },

  /**
   * Canjear saldo (total o parcial). Transaction-safe con SELECT FOR UPDATE
   * para prevenir double-spend bajo concurrencia.
   *
   * @param amount Monto a consumir (> 0, <= balance actual)
   * @param orderId Opcional: FK del pedido al que se aplica el canje
   */
  async redeem(
    tenantId: string,
    plainCode: string,
    userId: string | null,
    amount: number,
    orderId?: string | null,
  ): Promise<RedeemResult> {
    if (!isPlausibleCode(plainCode)) {
      return { ok: false, error: "INVALID_FORMAT" };
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return { ok: false, error: "INVALID_AMOUNT" };
    }

    const codeHash = hashCode(plainCode);

    try {
      // Usamos $transaction con raw SELECT FOR UPDATE para serializar canjes
      // concurrentes sobre la misma row. Prisma no expone FOR UPDATE en su
      // query builder, asi que lockeamos via $queryRaw.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await prisma.$transaction(async (tx: any) => {
        // 1) Lock de la fila via raw SELECT ... FOR UPDATE
        const locked = await tx.$queryRaw<
          Array<{
            id: string;
            balanceSoles: unknown;
            amountSoles: unknown;
            status: string;
            expiresAt: Date | null;
            firstRedeemedAt: Date | null;
          }>
        >`
          SELECT "id", "balanceSoles", "amountSoles", "status", "expiresAt", "firstRedeemedAt"
          FROM "gift_cards"
          WHERE "tenantId" = ${tenantId} AND "codeHash" = ${codeHash}
          FOR UPDATE
        `;

        const card = locked[0];
        if (!card) return { ok: false as const, error: "NOT_FOUND" as const };
        if (card.status === "cancelled") {
          return { ok: false as const, error: "CANCELLED" as const };
        }
        if (card.status === "expired") {
          return { ok: false as const, error: "EXPIRED" as const };
        }
        if (card.expiresAt && card.expiresAt.getTime() < Date.now()) {
          return { ok: false as const, error: "EXPIRED" as const };
        }
        const balanceBefore = toNumOrZero(card.balanceSoles);
        const amountOriginal = toNumOrZero(card.amountSoles);
        if (amount > balanceBefore) {
          return { ok: false as const, error: "INSUFFICIENT_BALANCE" as const };
        }

        const balanceAfter = Number((balanceBefore - amount).toFixed(2));
        const nowIso = new Date();
        const newStatus = balanceAfter <= 0 ? "fully_redeemed" : "partially_redeemed";

        // 2) Insert redemption row
        await tx.$executeRaw`
          INSERT INTO "gift_card_redemptions"
            ("id", "giftCardId", "tenantId", "userId", "orderId", "amountRedeemed", "redeemedAt")
          VALUES
            (${`gcr_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`},
             ${card.id}, ${tenantId}, ${userId}, ${orderId ?? null}, ${amount}, ${nowIso})
        `;

        // 3) Update balance + status + timestamps
        await tx.$executeRaw`
          UPDATE "gift_cards"
          SET "balanceSoles" = ${balanceAfter},
              "status" = ${newStatus}::"GiftCardStatus",
              "firstRedeemedAt" = COALESCE("firstRedeemedAt", ${nowIso}),
              "fullyRedeemedAt" = CASE WHEN ${balanceAfter} <= 0 THEN ${nowIso} ELSE "fullyRedeemedAt" END,
              "recipientUserId" = COALESCE("recipientUserId", ${userId}),
              "updatedAt" = ${nowIso}
          WHERE "id" = ${card.id}
        `;

        return {
          ok: true as const,
          cardId: card.id,
          balanceAfter,
          amountOriginal,
        };
      });

      if (!result.ok) return result;

      // Re-leer la row final para mapear
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const final = await (prisma.giftCard as any).findUnique({
        where: { id: result.cardId },
      });

      // Audit + cache invalidation
      logActivity(
        "gift_card_redeem",
        "GiftCard",
        `Canje ${amount} PEN (saldo ${result.balanceAfter}) orderId=${orderId ?? "-"}`,
        result.cardId,
        userId ?? "guest",
        undefined,
        tenantId,
      ).catch((err) => {
      logger.error("[gift-cards] activity log failed", {
        err: err instanceof Error ? err.message : String(err),
      });
    });

      if (userId) {
        invalidateByPrefix(PREFIX_RECEIVED(tenantId, userId));
        invalidateByPrefix(PREFIX_USAGE(tenantId, userId));
      }
      invalidateByPrefix(PREFIX_STATS(tenantId));

      return {
        ok: true,
        giftCard: mapGiftCardRow(final),
        redeemedAmount: amount,
        balanceAfter: result.balanceAfter,
      };
    } catch (e) {
      logger.error("[gift-cards/redeem] transaction failed", {
        err: e instanceof Error ? e.message : String(e),
      });
      return { ok: false, error: "NOT_FOUND" };
    }
  },

  /**
   * Admin: cancelar una gift card y reembolsar (balance → 0, status='cancelled').
   * Solo admins con permiso. Tambien borra saldo disponible para canje futuro.
   */
  async cancelAndRefund(
    tenantId: string,
    giftCardId: string,
    adminUserId: string,
    reason: string,
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const existing = await (prisma.giftCard as any).findFirst({
        where: { tenantId, id: giftCardId },
      });
      if (!existing) return { ok: false, error: "NOT_FOUND" };
      if (existing.status === "cancelled") {
        return { ok: false, error: "ALREADY_CANCELLED" };
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (prisma.giftCard as any).update({
        where: { id: giftCardId },
        data: {
          status: "cancelled",
          balanceSoles: 0,
          cancelledAt: new Date(),
          cancelReason: reason.slice(0, 200),
        },
      });

      logActivity(
        "gift_card_cancel",
        "GiftCard",
        `Cancelacion admin: ${reason}`,
        giftCardId,
        adminUserId,
        undefined,
        tenantId,
      ).catch((err) => {
      logger.error("[gift-cards] activity log failed", {
        err: err instanceof Error ? err.message : String(err),
      });
    });

      // Invalidar caches globales del tenant (no sabemos el sender/recipient)
      invalidateByPrefix(`giftcards:${tenantId}:`);

      return { ok: true };
    } catch (e) {
      logger.error("[gift-cards/cancel] error", {
        err: e instanceof Error ? e.message : String(e),
      });
      return { ok: false, error: "INTERNAL" };
    }
  },

  /**
   * Admin: emitir gift card manual (cortesia, compensacion).
   * Devuelve plainCode para que el admin lo entregue al destinatario.
   */
  async issueManual(
    tenantId: string,
    input: IssueManualInput,
    adminUserId: string,
  ): Promise<PurchaseResult> {
    const plainCode = generateCode();
    const codeHash = hashCode(plainCode);
    const last4 = codeLast4(plainCode);
    const designEnum = DESIGN_TO_DB[input.design ?? "general"];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (prisma.giftCard as any).create({
      data: {
        tenantId,
        codeHash,
        codeLast4: last4,
        amountSoles: input.amount,
        balanceSoles: input.amount,
        currency: "PEN",
        design: designEnum,
        status: "active",
        senderName: `Admin (${input.reason})`,
        senderUserId: adminUserId,
        recipientName: input.recipientName,
        recipientEmail: input.recipientEmail ?? null,
        recipientPhone: input.recipientPhone ?? null,
        dedicatoria: (input.message ?? "").slice(0, 200),
        expiresAt: input.expiresAt ?? null,
      },
    });

    logActivity(
      "gift_card_issue_manual",
      "GiftCard",
      `Emision manual ${input.amount} PEN: ${input.reason}`,
      row.id,
      adminUserId,
      undefined,
      tenantId,
    ).catch((err) => {
      logger.error("[gift-cards] activity log failed", {
        err: err instanceof Error ? err.message : String(err),
      });
    });

    invalidateByPrefix(PREFIX_STATS(tenantId));

    return { giftCard: mapGiftCardRow(row), plainCode };
  },

  /**
   * Admin: get por id para drill-down.
   */
  async getById(
    tenantId: string,
    giftCardId: string,
  ): Promise<DbGiftCard | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (prisma.giftCard as any).findFirst({
      where: { tenantId, id: giftCardId },
    });
    return row ? mapGiftCardRow(row) : null;
  },

  /**
   * Admin: stats agregadas del tenant (KPIs del dashboard).
   * Cacheado 2 minutos. Invalidado en cada write.
   */
  async getStats(tenantId: string): Promise<{
    vendidas30d: number;
    ingreso30d: number;
    canjeadas30d: number;
    saldoPendiente: number;
    totalActivas: number;
    totalCanceladas: number;
  }> {
    return getOrSet(PREFIX_STATS(tenantId), STATS_TTL_SEC, async () => {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const [vendidas, canjeadas, saldo, totals] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (prisma.giftCard as any).aggregate({
          where: { tenantId, purchasedAt: { gte: since } },
          _count: { _all: true },
          _sum: { amountSoles: true },
        }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (prisma.giftCardRedemption as any).aggregate({
          where: { tenantId, redeemedAt: { gte: since } },
          _count: { _all: true },
        }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (prisma.giftCard as any).aggregate({
          where: {
            tenantId,
            status: { in: ["active", "partially_redeemed"] },
          },
          _sum: { balanceSoles: true },
        }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (prisma.giftCard as any).groupBy({
          by: ["status"],
          where: { tenantId },
          _count: { _all: true },
        }),
      ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const activas = totals.find((t: any) => t.status === "active")?._count?._all ?? 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parciales = totals.find((t: any) => t.status === "partially_redeemed")?._count?._all ?? 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const canceladas = totals.find((t: any) => t.status === "cancelled")?._count?._all ?? 0;

      return {
        vendidas30d: vendidas._count?._all ?? 0,
        ingreso30d: toNumOrZero(vendidas._sum?.amountSoles),
        canjeadas30d: canjeadas._count?._all ?? 0,
        saldoPendiente: toNumOrZero(saldo._sum?.balanceSoles),
        totalActivas: activas + parciales,
        totalCanceladas: canceladas,
      };
    });
  },

  /**
   * Admin: listar todas las gift cards del tenant con filtros basicos.
   */
  async listForAdmin(
    tenantId: string,
    filters: {
      status?: MockGiftCardStatus | "all";
      search?: string;
      limit?: number;
    } = {},
  ): Promise<DbGiftCard[]> {
    const { status, search, limit = 200 } = filters;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { tenantId };
    if (status && status !== "all") {
      if (status === "activa") where.status = { in: ["active", "partially_redeemed"] };
      else if (status === "canjeada") where.status = "fully_redeemed";
      else if (status === "expirada") where.status = { in: ["expired", "cancelled"] };
    }
    if (search) {
      const s = normalizeCode(search);
      where.OR = [
        { recipientName: { contains: search, mode: "insensitive" } },
        { codeLast4: { equals: s.slice(-4) } },
      ];
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await (prisma.giftCard as any).findMany({
      where,
      orderBy: { purchasedAt: "desc" },
      take: limit,
    });
    return rows.map(mapGiftCardRow);
  },
};
