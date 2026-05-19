/**
 * __tests__/test-utils/prisma-mock.ts
 *
 * Factory compartida para mocks de Prisma + tx en tests.
 *
 * Background (audit Code Reviewer 2026-05-12):
 * 10+ tests replican `vi.mock("@/lib/prisma", () => { ... })` con ligeras
 * variaciones. Si el schema cambia, hay que actualizar 10 mocks distintos.
 * Esta factory centraliza el patrón.
 *
 * Uso:
 *
 *   import { createPrismaMock, makeTx } from "@/__tests__/test-utils/prisma-mock";
 *
 *   const prismaMock = createPrismaMock();
 *   vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
 *
 *   // En cada test:
 *   prismaMock.order.findFirst.mockResolvedValue({ id: "o1", ... });
 *
 *   // Para tests con transactions:
 *   prismaMock.$transaction.mockImplementation(async (fn) => fn(makeTx({
 *     order: { create: vi.fn() },
 *     product: { findFirst: vi.fn(), updateMany: vi.fn() },
 *   })));
 */

import { vi, type Mock } from "vitest";

/**
 * Modelos críticos del schema con sus métodos típicos.
 * Agregar nuevos modelos aquí cuando el schema crezca.
 */
export const PRISMA_MODELS = [
  "tenant", "customer", "order", "orderItem", "sale", "saleItem",
  "product", "productImage", "productVariant", "productModifierGroup",
  "productModifierOption", "review", "reviewVote",
  "promotion", "coupon", "discountRule",
  "supplier", "purchaseOrder", "payable", "payment",
  "inventoryMovement", "batch", "warehouse", "transfer", "location",
  "cashRegister", "cashMovement", "expense",
  "fiado", "fiadoCuota", "turno",
  "prestamo", "prestamoCuota", "prestamoDocumento",
  "treasuryCuenta", "treasuryMovimiento", "treasuryTransferencia",
  "store", "storeProduct", "commissionRule", "commissionLedger",
  "deliveryPartner", "deliveryAssignment", "deliveryOffer", "deliverySlot",
  "settings", "adminUser", "superadminUser",
  "activityLog", "notification", "customerNotification",
  "messageTemplate", "note", "savedFilter", "savedCart", "savedLocation",
  "tenantWhatsAppConfig", "whatsAppConversation",
  "loyaltyTransaction", "subscription", "subscriptionDelivery",
  "giftCard", "giftCardRedemption", "paymentApproval",
  "campaign", "newsletterSubscriber", "visitorWelcome",
  "page", "pageBlock", "pageVersion", "media",
  "dailySummary", "stripeWebhookQueue",
  "abTest", "abTestEvent", "surveyResponse",
  "cotizacion", "cotizacionItem", "guiaRemision", "guiaRemisionItem",
  "notaCredito", "receta", "recetaIngrediente", "produccionLote",
  "complianceItem", "customKpi", "supportTicket", "supplierPortal",
  "wholesaleOrder", "wholesaleOrderItem", "tenantHealthScore",
  "churnSignal", "creditProfile", "creditInstallment",
  "forecastLog", "supplierRating", "supplierEvaluation",
  "documentTemplate", "document", "documentFolder", "documentShare",
  "aIConversation", "conversationMessage", "conversationThread",
  "liveProduct", "liveSession", "liveChatMessage",
  "deliveryRoute", "deliveryRouteStop", "deliveryTracking",
  "vendorApplication", "socioMembership", "tenantStorePage",
  "eventDeadLetter", "commentaryItem",
] as const;

export type PrismaModelName = (typeof PRISMA_MODELS)[number];

/**
 * Métodos típicos de cada modelo Prisma. Todos son `vi.fn()` por defecto.
 */
function modelMethods() {
  return {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn(),
    aggregate: vi.fn(),
    groupBy: vi.fn(),
  };
}

/**
 * Crea un objeto Prisma mock completo con todos los modelos + utilidades.
 *
 * El `$transaction` por defecto pasa-through el callback con un mock tx que
 * tiene los mismos modelos. Si necesitás un tx custom, mockealo después:
 *
 *   prismaMock.$transaction.mockImplementation(async (fn) => fn(customTx));
 */
export function createPrismaMock() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mock: any = {
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => {
      // Default: pasa el mismo mock como tx
      return fn(mock);
    }),
    $queryRaw: vi.fn(),
    $queryRawUnsafe: vi.fn(),
    $executeRaw: vi.fn(),
    $executeRawUnsafe: vi.fn(),
    $connect: vi.fn(),
    $disconnect: vi.fn(),
  };

  for (const model of PRISMA_MODELS) {
    mock[model] = modelMethods();
  }

  return mock;
}

/**
 * Helper para crear un `tx` mock dentro de un `$transaction` que incluye
 * SOLO los modelos que el test necesita. Útil para detectar uso de modelos
 * inesperados en el callback (TypeError si el código real usa otro modelo
 * no mockeado).
 *
 * Uso:
 *   prismaMock.$transaction.mockImplementation(async (fn) => fn(makeTx({
 *     order: { findFirst: vi.fn().mockResolvedValue({ id: "o1" }) },
 *     product: { findFirst: vi.fn(), updateMany: vi.fn() },
 *   })));
 */
export function makeTx<T extends Record<string, Partial<ReturnType<typeof modelMethods>>>>(
  overrides: T,
) {
  const tx: Record<string, ReturnType<typeof modelMethods>> = {};
  for (const [modelName, methods] of Object.entries(overrides)) {
    tx[modelName] = { ...modelMethods(), ...methods };
  }
  return tx;
}

/**
 * Reset all mocks en un objeto Prisma mock — usar en beforeEach.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function resetPrismaMock(mock: any): void {
  for (const key of Object.keys(mock)) {
    const value = mock[key];
    if (typeof value === "function" && "mockReset" in value) {
      (value as Mock).mockReset();
    } else if (value && typeof value === "object") {
      for (const method of Object.values(value)) {
        if (typeof method === "function" && "mockReset" in method) {
          (method as Mock).mockReset();
        }
      }
    }
  }
}
