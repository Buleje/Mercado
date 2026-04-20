/**
 * lib/payments/index.ts
 *
 * Barrel export de la capa PaymentProvider.
 * Importar desde "@/lib/payments" en lugar de rutas internas.
 */

export type {
  PaymentProvider,
  PaymentProviderId,
  Currency,
  PaymentMethod,
  ChargeInput,
  ChargeResult,
  RefundInput,
  RefundResult,
  WebhookRequest,
  WebhookVerification,
  PaymentStatus,
} from "./provider";

export {
  PaymentProviderIdSchema,
  CurrencySchema,
  PaymentMethodSchema,
  ChargeInputSchema,
  ChargeResultSchema,
  RefundInputSchema,
  RefundResultSchema,
  WebhookRequestSchema,
  WebhookVerificationSchema,
  PaymentStatusSchema,
} from "./provider";

export { getPaymentProvider, listAvailableProviders } from "./registry";
