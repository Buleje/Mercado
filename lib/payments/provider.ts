/**
 * lib/payments/provider.ts
 *
 * PaymentProvider — Strategy pattern interface.
 * Desacopla el checkout de los proveedores de pago concretos.
 *
 * Ciclo de vida:
 *   charge()            — inicia el cobro
 *   getPaymentStatus()  — consulta estado por ID externo
 *   refund()            — devuelve dinero al cliente
 *   verifyWebhook()     — valida la firma + parsea el payload del IPN
 */

import { z } from "zod/v4";

// ─── IDs canónicos ────────────────────────────────────────────────────────────

export const PaymentProviderIdSchema = z.enum([
  "culqi",
  "izipay",
  "mercadopago",
  "pagoefectivo",
]);

export type PaymentProviderId = z.infer<typeof PaymentProviderIdSchema>;

export const CurrencySchema = z.enum(["PEN", "USD"]);
export type Currency = z.infer<typeof CurrencySchema>;

export const PaymentMethodSchema = z.enum(["card", "wallet", "cash", "transfer"]);
export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;

// ─── ChargeInput ──────────────────────────────────────────────────────────────

export const ChargeInputSchema = z.object({
  /** Monto en centavos (entero). Ej: S/10.50 → 1050 */
  amountCents: z.number().int().nonnegative(),
  currency: CurrencySchema,
  method: PaymentMethodSchema,
  /** ID de la orden en nuestra BD — se usa como external_reference */
  orderId: z.string().min(1),
  /** Slug de la tienda del marketplace */
  storeSlug: z.string().min(1),
  customer: z.object({
    name: z.string().min(1),
    email: z.string().email().optional(),
    phone: z.string().optional(),
  }),
  /** Token de tarjeta / nonce que viene del SDK del proveedor (frontend) */
  sourceToken: z.string().optional(),
  /** URL a la que redirigir tras el pago (para proveedores redirect-based) */
  returnUrl: z.string().url().optional(),
  /** Metadata libre para trazabilidad */
  metadata: z.record(z.string(), z.string()).optional(),
});

export type ChargeInput = z.infer<typeof ChargeInputSchema>;

// ─── ChargeResult — discriminated union ──────────────────────────────────────
//
// Usar en el consumidor con un switch exhaustivo:
//
//   switch (result.status) {
//     case "succeeded": ...
//     case "pending":   ... result.nextAction ...
//     case "failed":    ... result.reason ...
//     default: result satisfies never;
//   }

export const ChargeResultSucceededSchema = z.object({
  status: z.literal("succeeded"),
  externalId: z.string(),
  providerResponse: z.unknown().optional(),
});

export const ChargeResultPendingSchema = z.object({
  status: z.literal("pending"),
  externalId: z.string(),
  /** URL de redirect o instrucciones para completar el pago */
  nextAction: z.object({
    type: z.enum(["redirect", "display_code", "poll"]),
    /** URL destino si type === "redirect" */
    redirectUrl: z.string().url().optional(),
    /** Código de pago si type === "display_code" (PagoEfectivo, Rapipago, etc.) */
    paymentCode: z.string().optional(),
    /** Timestamp Unix (ms) de expiración */
    expiresAt: z.number().optional(),
  }),
  providerResponse: z.unknown().optional(),
});

export const ChargeResultFailedSchema = z.object({
  status: z.literal("failed"),
  reason: z.string(),
  /** Código de error del proveedor para logging / soporte */
  providerCode: z.string().optional(),
  providerResponse: z.unknown().optional(),
});

export const ChargeResultSchema = z.discriminatedUnion("status", [
  ChargeResultSucceededSchema,
  ChargeResultPendingSchema,
  ChargeResultFailedSchema,
]);

export type ChargeResult = z.infer<typeof ChargeResultSchema>;

// ─── RefundInput / RefundResult ───────────────────────────────────────────────

export const RefundInputSchema = z.object({
  externalId: z.string().min(1),
  amountCents: z.number().int().positive().optional(), // undefined = reembolso total
  reason: z.string().optional(),
});

export type RefundInput = z.infer<typeof RefundInputSchema>;

export const RefundResultSchema = z.object({
  refundId: z.string(),
  status: z.enum(["succeeded", "pending", "failed"]),
  amountCents: z.number().int().nonnegative(),
  providerResponse: z.unknown().optional(),
});

export type RefundResult = z.infer<typeof RefundResultSchema>;

// ─── WebhookRequest ───────────────────────────────────────────────────────────

export const WebhookRequestSchema = z.object({
  /** Headers HTTP tal como los entrega Next.js (headers().get()) */
  headers: z.record(z.string(), z.string().nullable()),
  /** Body raw como string (para calcular HMAC) */
  rawBody: z.string(),
  /** Body ya parseado como JSON (puede ser unknown) */
  body: z.unknown(),
  /** Query params si los usa el proveedor (ej: PagoEfectivo envía ?id=...) */
  query: z.record(z.string(), z.string()).optional(),
});

export type WebhookRequest = z.infer<typeof WebhookRequestSchema>;

// ─── WebhookVerification ──────────────────────────────────────────────────────

export const WebhookVerificationSchema = z.object({
  valid: z.boolean(),
  /** Tipo de evento según nomenclatura del proveedor, ej: "payment.approved" */
  eventType: z.string(),
  /** Payload ya estructurado para el handler interno */
  payload: z.unknown(),
  /** ID del cobro en el sistema del proveedor */
  externalId: z.string(),
});

export type WebhookVerification = z.infer<typeof WebhookVerificationSchema>;

// ─── PaymentStatus ────────────────────────────────────────────────────────────

export const PaymentStatusSchema = z.object({
  externalId: z.string(),
  status: z.enum(["pending", "processing", "succeeded", "failed", "refunded", "cancelled"]),
  amountCents: z.number().int().nonnegative(),
  currency: CurrencySchema,
  /** ISO 8601 */
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  providerResponse: z.unknown().optional(),
});

export type PaymentStatus = z.infer<typeof PaymentStatusSchema>;

// ─── PaymentProvider — interface principal ────────────────────────────────────

export interface PaymentProvider {
  readonly id: PaymentProviderId;
  readonly displayName: string;
  /** Monedas aceptadas */
  readonly supportsCurrencies: readonly Currency[];
  /** Métodos de pago soportados */
  readonly supportsMethods: readonly PaymentMethod[];

  /**
   * Inicia un cobro.
   * Retorna una discriminated union — el consumidor DEBE manejar los 3 casos.
   */
  charge(input: ChargeInput): Promise<ChargeResult>;

  /**
   * Solicita un reembolso total o parcial.
   */
  refund(input: RefundInput): Promise<RefundResult>;

  /**
   * Verifica la firma HMAC del webhook entrante y extrae el payload
   * normalizado. Llamar ANTES de procesar cualquier IPN.
   */
  verifyWebhook(req: WebhookRequest): Promise<WebhookVerification>;

  /**
   * Consulta el estado actual de un pago por su ID externo.
   * Útil para polling en flujos pending.
   */
  getPaymentStatus(externalId: string): Promise<PaymentStatus>;
}
