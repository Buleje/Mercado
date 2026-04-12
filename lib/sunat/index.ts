/**
 * lib/sunat/index.ts
 *
 * Barrel export del módulo SUNAT.
 * Importar desde "@/lib/sunat" para acceder a todo lo público.
 */

// Cliente HTTP Nubefact
export {
  sendInvoice,
  sendCreditNote,
  voidInvoice,
  getInvoiceStatus,
  type NubefactComprobantePayload,
  type NubefactBajaPayload,
  type NubefactItem,
  type NubefactResponse,
} from "./nubefact-client";

// Constructores de payload
export {
  buildBoleta,
  buildFactura,
  buildNotaCredito,
  buildBaja,
  type BuilderOrder,
  type BuilderOrderItem,
  type BuilderTenant,
  type BuilderSettings,
  type BuilderCustomer,
  type BuiltCreditNoteInput,
} from "./invoice-builder";

// Worker idempotente
export {
  runSunatWorker,
  retryInvoice,
  initSunatWorkerSubscription,
} from "./invoice-worker";

// EventBus sale.created
export {
  sunatEventBus,
  type SaleCreatedEvent,
  type SunatInvoiceUpdatedEvent,
} from "./sale-events";

// Validación de webhooks
export {
  validateWebhookSignature,
  mapWebhookEstadoToStatus,
  type NubefactWebhookPayload,
  type WebhookValidationResult,
} from "./webhook-validator";

// Utilidades de cálculo IGV (re-exportadas desde lib/sunat.ts para
// que invoice-builder e invoice-worker puedan importar desde "@/lib/sunat")
export {
  calculateIGV,
  validateRUC,
  validateDNI,
  type IgvCalculation,
  type SunatDocument,
  type SunatResult,
} from "../sunat";
