/**
 * lib/sunat/sale-events.ts
 *
 * EventEmitter singleton para eventos de venta → facturación electrónica.
 *
 * Propósito: desacoplar el módulo de ventas del módulo SUNAT.
 * Las ventas emiten "sale.created" via el endpoint /api/sunat/emit-on-sale.
 * El worker de facturas escucha ese evento y encola la emisión a Nubefact.
 *
 * Por qué EventEmitter y no DomainEvents (BullMQ)?
 *   - El dirty tree impide modificar sales.db.ts
 *   - El emit-on-sale endpoint actúa como puente externo
 *   - Para el tree limpio: migrar a DomainEvents.ventaCompletada (ADR-046)
 */

import { EventEmitter } from "node:events";

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface SaleCreatedEvent {
  saleId: string;
  tenantId: string;
  /** "boleta" | "factura" | "ticket" — ticket no genera comprobante electrónico */
  comprobanteTipo: "boleta" | "factura" | "ticket";
  /** Solo requerido cuando comprobanteTipo === "factura" */
  comprobanteRuc?: string;
  customerName?: string;
}

export interface SunatInvoiceUpdatedEvent {
  invoiceId: string;
  tenantId: string;
  status: "accepted" | "rejected" | "voided";
  pdfUrl?: string;
  nubefactId?: string;
}

export type SunatEventMap = {
  "sale.created": [SaleCreatedEvent];
  "sunat.invoice.updated": [SunatInvoiceUpdatedEvent];
};

// ── Singleton ─────────────────────────────────────────────────────────────────

class SunatEventBus extends EventEmitter {
  constructor() {
    super();
    // Máximo listeners por evento para evitar memory leak warnings
    this.setMaxListeners(20);
  }

  emitSaleCreated(event: SaleCreatedEvent): boolean {
    return this.emit("sale.created", event);
  }

  emitInvoiceUpdated(event: SunatInvoiceUpdatedEvent): boolean {
    return this.emit("sunat.invoice.updated", event);
  }

  onSaleCreated(handler: (event: SaleCreatedEvent) => void | Promise<void>): this {
    return this.on("sale.created", handler);
  }

  onInvoiceUpdated(
    handler: (event: SunatInvoiceUpdatedEvent) => void | Promise<void>
  ): this {
    return this.on("sunat.invoice.updated", handler);
  }
}

// Singleton global (sobrevive hot-reload en Next.js dev via globalThis)
const GLOBAL_KEY = "__sunat_event_bus__";

declare global {
   
  var __sunat_event_bus__: SunatEventBus | undefined;
}

export const sunatEventBus: SunatEventBus =
  globalThis[GLOBAL_KEY] ?? (globalThis[GLOBAL_KEY] = new SunatEventBus());
