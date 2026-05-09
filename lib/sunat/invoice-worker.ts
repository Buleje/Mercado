/**
 * lib/sunat/invoice-worker.ts
 *
 * Worker idempotente de facturación electrónica.
 * Procesa la cola de facturas pendientes/retrying y las envía a Nubefact.
 *
 * Idempotencia: verifica sunatStatus antes de reintentar.
 * Si ya existe un SunatInvoice con status=accepted, no hace nada.
 *
 * Retry policy: máx. MAX_RETRY_ATTEMPTS. Después de eso → status="failed" (rejected).
 * Se implementa marcando sunatStatus="retrying" y llevando conteo en errorMessage.
 */

import "server-only";
import { SunatDB } from "@/lib/db/sunat.db";
import { sendInvoice } from "@/lib/sunat/nubefact-client";
import { buildBoleta, buildFactura } from "@/lib/sunat/invoice-builder";
import { calculateIGV } from "@/lib/sunat";
import { prisma } from "@/lib/prisma";
import { toNumOrZero } from "@/lib/decimal-utils";
import { logger } from "@/lib/logger";
import { DomainEvents } from "@/lib/domain-events";
import { sunatEventBus } from "@/lib/sunat/sale-events";
import type { SaleCreatedEvent } from "@/lib/sunat/sale-events";

// ── Constantes ────────────────────────────────────────────────────────────────

const MAX_RETRY_ATTEMPTS = 5;
const RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 16_000]; // exponential backoff

// ── Worker principal ──────────────────────────────────────────────────────────

/**
 * Procesa todas las facturas pending/retrying del tenant.
 * Llamado por el cron endpoint /api/cron/sunat-retry.
 */
export async function runSunatWorker(tenantId: string): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  const pending = await SunatDB.getPendingInvoices(tenantId);

  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  for (const invoice of pending) {
    processed++;

    // Extraer conteo de intentos del errorMessage (formato "attempt:N|msg")
    const currentAttempt = parseAttemptFromError(invoice.errorMessage);

    if (currentAttempt >= MAX_RETRY_ATTEMPTS) {
      // Marcar definitivamente como fallido
      await SunatDB.updateInvoice(tenantId, invoice.id, {
        sunatStatus: "rejected",
        errorMessage: `Max intentos (${MAX_RETRY_ATTEMPTS}) alcanzados. Última: ${invoice.errorMessage ?? "desconocido"}`,
      });
      failed++;
      logger.warn("[SunatWorker] Factura marcada como fallida definitiva", {
        invoiceId: invoice.id,
        tenantId,
        attempts: currentAttempt,
      });
      continue;
    }

    // Obtener datos de la orden para reconstruir el payload
    try {
      await processInvoice(tenantId, invoice.id, invoice.orderId, invoice.type, currentAttempt);
      succeeded++;
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("[SunatWorker] Error procesando factura", {
        invoiceId: invoice.id,
        attempt: currentAttempt + 1,
        error: msg,
      });
    }
  }

  logger.info("[SunatWorker] Ciclo completado", {
    tenantId,
    processed,
    succeeded,
    failed,
  });

  return { processed, succeeded, failed };
}

/**
 * Procesa una única factura por ID (para reintento manual desde API).
 */
export async function retryInvoice(tenantId: string, invoiceId: string): Promise<void> {
  const invoice = await SunatDB.getInvoiceById(tenantId, invoiceId);
  if (!invoice) {
    throw new Error(`Factura ${invoiceId} no encontrada para tenant ${tenantId}`);
  }
  if (invoice.sunatStatus === "accepted") {
    logger.info("[SunatWorker] Factura ya aceptada, skip", { invoiceId });
    return;
  }

  const attempt = parseAttemptFromError(invoice.errorMessage);
  await processInvoice(tenantId, invoiceId, invoice.orderId, invoice.type, attempt);
}

// ── Lógica interna ────────────────────────────────────────────────────────────

async function processInvoice(
  tenantId: string,
  invoiceId: string,
  orderId: string | null,
  invoiceType: string,
  attempt: number
): Promise<void> {
  // Esperar el backoff correspondiente (excepto primer intento)
  if (attempt > 0) {
    const delayMs = RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)];
    await sleep(delayMs);
  }

  // Cargar datos de la factura y la orden
  const invoice = await SunatDB.getInvoiceById(tenantId, invoiceId);
  if (!invoice) throw new Error("Factura no encontrada al reintentar");

  // Obtener configuración SUNAT del tenant
  const sunatConfig = await SunatDB.getConfig(tenantId);
  if (!sunatConfig) {
    throw new Error(`Configuración SUNAT no encontrada para tenant ${tenantId}`);
  }

  // Si hay orderId, reconstruir payload desde la orden
  // Si no hay orderId (factura manual), no podemos reconstruir — marcar como failed
  if (!orderId) {
    await SunatDB.updateInvoice(tenantId, invoiceId, {
      sunatStatus: "rejected",
      errorMessage: "No se puede reintentar: sin orderId asociado",
    });
    return;
  }

  const order = await prisma.order.findFirst({
    where: { id: orderId, tenantId },
    include: { items: true },
  });

  if (!order) {
    await SunatDB.updateInvoice(tenantId, invoiceId, {
      sunatStatus: "rejected",
      errorMessage: `Orden ${orderId} no encontrada`,
    });
    return;
  }

  // Construir payload
  const isBoleta = invoiceType === "boleta";
  const builderOrder = {
    id: order.id,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    total: toNumOrZero(order.total),
    items: order.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      price: toNumOrZero(item.price),
      unit: item.unit,
    })),
  };

  const builderTenant = {
    ruc: sunatConfig.ruc,
    razonSocial: sunatConfig.razonSocial,
    direccionFiscal: sunatConfig.direccionFiscal,
  };

  const builderSettings = {
    boletaSeries: sunatConfig.boletaSeries,
    facturaSeries: sunatConfig.facturaSeries,
    nextBoletaNum: invoice.number,
    nextFacturaNum: invoice.number,
  };

  const payload = isBoleta
    ? buildBoleta(builderOrder, builderTenant, builderSettings)
    : buildFactura(builderOrder, builderTenant, builderSettings, {
        ruc: invoice.customerRuc ?? "",
        razonSocial: invoice.customerName,
      });

  // Marcar como retrying antes de enviar
  await SunatDB.updateInvoice(tenantId, invoiceId, {
    sunatStatus: "retrying",
    sentAt: new Date(),
    errorMessage: encodeAttempt(attempt + 1, "en progreso"),
  });

  // Enviar a Nubefact
  try {
    const response = await sendInvoice(tenantId, payload);
    const sunatStatus = response.sunat_accepted ? "accepted" : "rejected";

    await SunatDB.updateInvoice(tenantId, invoiceId, {
      sunatStatus,
      nubefactId: response.nubefact_id ?? null,
      pdfUrl: response.enlace_del_pdf ?? null,
      cdrResponse: response.cdr_base_64_encoded ?? null,
      acceptedAt: sunatStatus === "accepted" ? new Date() : null,
      errorMessage: sunatStatus === "rejected"
        ? (response.sunat_description ?? "Rechazado por SUNAT")
        : null,
    });

    if (sunatStatus === "accepted") {
      const igvCalc = calculateIGV(toNumOrZero(order.total));
      DomainEvents.facturaEmitida(tenantId, {
        facturaId: invoiceId,
        orderId,
        customerDocument: invoice.customerRuc ?? "",
        customerName: invoice.customerName,
        documentType: invoiceType as "factura" | "boleta" | "nota_credito",
        total: +igvCalc.total.toFixed(2),
        sunatHash: response.nubefact_id ?? undefined,
        cdrUrl: response.enlace_del_pdf ?? undefined,
      }).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });

      sunatEventBus.emitInvoiceUpdated({
        invoiceId,
        tenantId,
        status: "accepted",
        pdfUrl: response.enlace_del_pdf ?? undefined,
        nubefactId: response.nubefact_id ?? undefined,
      });
    }

    logger.info("[SunatWorker] Factura procesada", {
      invoiceId,
      tenantId,
      status: sunatStatus,
      attempt: attempt + 1,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await SunatDB.updateInvoice(tenantId, invoiceId, {
      sunatStatus: attempt + 1 >= MAX_RETRY_ATTEMPTS ? "rejected" : "retrying",
      errorMessage: encodeAttempt(attempt + 1, msg),
    });
    throw err;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function encodeAttempt(attempt: number, message: string): string {
  return `attempt:${attempt}|${message}`;
}

function parseAttemptFromError(errorMessage: string | null): number {
  if (!errorMessage) return 0;
  const match = errorMessage.match(/^attempt:(\d+)\|/);
  return match ? parseInt(match[1], 10) : 0;
}

// ── Suscripción al EventBus ───────────────────────────────────────────────────

/**
 * Inicializa el worker suscribiéndose al evento "sale.created".
 * Llamar una vez al arrancar (en instrumentación o middleware).
 * Es fire-and-forget: si falla, la venta no se bloquea.
 */
export function initSunatWorkerSubscription(): void {
  sunatEventBus.onSaleCreated(async (event: SaleCreatedEvent) => {
    if (event.comprobanteTipo === "ticket") {
      return; // tickets no generan comprobante electrónico
    }

    const { saleId, tenantId, comprobanteTipo, comprobanteRuc, customerName } = event;

    try {
      // Verificar idempotencia: si ya existe, no duplicar
      const existing = await SunatDB.findByOrderId(tenantId, saleId);
      if (existing) {
        logger.info("[SunatWorker] Comprobante ya existe para sale, skip", {
          saleId,
          existingId: existing.id,
          status: existing.sunatStatus,
        });
        return;
      }

      const sunatConfig = await SunatDB.getConfig(tenantId);
      if (!sunatConfig) {
        logger.warn("[SunatWorker] Sin config SUNAT, no se puede emitir", {
          tenantId,
          saleId,
        });
        return;
      }

      // Obtener número correlativo atómico
      const nextNumber = await SunatDB.incrementCorrelativo(tenantId, comprobanteTipo);
      const series =
        comprobanteTipo === "boleta" ? sunatConfig.boletaSeries : sunatConfig.facturaSeries;

      // Obtener datos de la sale/order para calcular totales
      const order = await prisma.order.findFirst({
        where: { id: saleId, tenantId },
        include: { items: true },
      });

      if (!order) {
        logger.warn("[SunatWorker] Orden no encontrada para saleId", { saleId, tenantId });
        return;
      }

      const total = toNumOrZero(order.total);
      const igvCalc = calculateIGV(total);

      // Crear registro pending — el cron lo procesará
      await SunatDB.createInvoice(tenantId, {
        orderId: saleId,
        type: comprobanteTipo,
        series,
        number: nextNumber,
        customerRuc: comprobanteTipo === "factura" ? comprobanteRuc : undefined,
        customerName: customerName ?? order.customerName ?? "CONSUMIDOR FINAL",
        subtotal: +igvCalc.gravado.toFixed(2),
        igv: +igvCalc.igv.toFixed(2),
        total: +igvCalc.total.toFixed(2),
      });

      logger.info("[SunatWorker] Factura encolada desde sale.created", {
        saleId,
        tenantId,
        comprobanteTipo,
        series,
        number: nextNumber,
      });
    } catch (err) {
      // Fire-and-forget: loguear pero NO bloquear la venta
      logger.error("[SunatWorker] Error encolando factura tras sale.created", {
        saleId,
        tenantId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
