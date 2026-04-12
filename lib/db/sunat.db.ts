/**
 * lib/db/sunat.db.ts
 *
 * CRUD para modelos SunatInvoice y TenantSunatConfig.
 * Aislamiento multi-tenant: tenantId siempre primer parámetro.
 * Nunca usar Prisma directo fuera de este archivo (CLAUDE.md regla #1).
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { toNumOrZero } from "@/lib/decimal-utils";
import type {
  SunatInvoice as PSunatInvoice,
  TenantSunatConfig as PTenantSunatConfig,
} from "@/lib/generated/prisma/client";

// ── Tipos de dominio ──────────────────────────────────────────────────────────

export type SunatInvoiceStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "voided"
  | "retrying";

export interface DbSunatInvoice {
  id: string;
  tenantId: string;
  orderId: string | null;
  type: string; // "boleta" | "factura" | "nota_credito" | "baja"
  series: string;
  number: number;
  customerRuc: string | null;
  customerName: string;
  subtotal: number;
  igv: number;
  total: number;
  xmlContent: string | null;
  cdrResponse: string | null;
  sunatStatus: SunatInvoiceStatus;
  nubefactId: string | null;
  pdfUrl: string | null;
  errorMessage: string | null;
  sentAt: string | null;
  acceptedAt: string | null;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface DbTenantSunatConfig {
  id: string;
  tenantId: string;
  ruc: string;
  razonSocial: string;
  direccionFiscal: string | null;
  ubigeo: string | null;
  nubefactToken: string;
  nubefactUrl: string;
  boletaSeries: string;
  facturaSeries: string;
  lastBoletaNum: number;
  lastFacturaNum: number;
  isProduction: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSunatInvoiceInput {
  orderId?: string;
  type: string;
  series: string;
  number: number;
  customerRuc?: string;
  customerName: string;
  subtotal: number;
  igv: number;
  total: number;
}

export interface UpdateSunatInvoiceInput {
  sunatStatus?: SunatInvoiceStatus;
  nubefactId?: string | null;
  pdfUrl?: string | null;
  xmlContent?: string | null;
  cdrResponse?: string | null;
  errorMessage?: string | null;
  sentAt?: Date | null;
  acceptedAt?: Date | null;
  retryCount?: number;
}

// ── Mappers ───────────────────────────────────────────────────────────────────

function toISO(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

function mapInvoice(r: PSunatInvoice): DbSunatInvoice {
  return {
    id: r.id,
    tenantId: r.tenantId,
    orderId: r.orderId ?? null,
    type: r.type,
    series: r.series,
    number: r.number,
    customerRuc: r.customerRuc ?? null,
    customerName: r.customerName,
    subtotal: toNumOrZero(r.subtotal),
    igv: toNumOrZero(r.igv),
    total: toNumOrZero(r.total),
    xmlContent: r.xmlContent ?? null,
    cdrResponse: r.cdrResponse ?? null,
    sunatStatus: r.sunatStatus as SunatInvoiceStatus,
    nubefactId: r.nubefactId ?? null,
    pdfUrl: r.pdfUrl ?? null,
    errorMessage: r.errorMessage ?? null,
    sentAt: toISO(r.sentAt),
    acceptedAt: toISO(r.acceptedAt),
    // retryCount no está en schema actual; fallback a 0
    retryCount: (r as unknown as { retryCount?: number }).retryCount ?? 0,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function mapConfig(c: PTenantSunatConfig): DbTenantSunatConfig {
  return {
    id: c.id,
    tenantId: c.tenantId,
    ruc: c.ruc,
    razonSocial: c.razonSocial,
    direccionFiscal: c.direccionFiscal ?? null,
    ubigeo: c.ubigeo ?? null,
    nubefactToken: c.nubefactToken,
    nubefactUrl: c.nubefactUrl,
    boletaSeries: c.boletaSeries,
    facturaSeries: c.facturaSeries,
    lastBoletaNum: c.lastBoletaNum,
    lastFacturaNum: c.lastFacturaNum,
    isProduction: c.isProduction,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

// ── SunatDB ───────────────────────────────────────────────────────────────────

export const SunatDB = {
  // ── Facturas ────────────────────────────────────────────────────────────────

  /**
   * Crea un registro de factura en estado "pending".
   * tenantId es el primer parámetro (regla #3 CLAUDE.md).
   */
  async createInvoice(
    tenantId: string,
    data: CreateSunatInvoiceInput
  ): Promise<DbSunatInvoice> {
    const inv = await prisma.sunatInvoice.create({
      data: {
        tenantId,
        orderId: data.orderId ?? null,
        type: data.type,
        series: data.series,
        number: data.number,
        customerRuc: data.customerRuc ?? null,
        customerName: data.customerName,
        subtotal: data.subtotal,
        igv: data.igv,
        total: data.total,
        sunatStatus: "pending",
        sentAt: new Date(),
      },
    });
    return mapInvoice(inv);
  },

  /**
   * Actualiza el estado de una factura después de la respuesta de Nubefact.
   */
  async updateInvoice(
    tenantId: string,
    invoiceId: string,
    data: UpdateSunatInvoiceInput
  ): Promise<DbSunatInvoice> {
    const inv = await prisma.sunatInvoice.update({
      where: { id: invoiceId, tenantId },
      data: {
        ...(data.sunatStatus !== undefined && { sunatStatus: data.sunatStatus }),
        ...(data.nubefactId !== undefined && { nubefactId: data.nubefactId }),
        ...(data.pdfUrl !== undefined && { pdfUrl: data.pdfUrl }),
        ...(data.xmlContent !== undefined && { xmlContent: data.xmlContent }),
        ...(data.cdrResponse !== undefined && { cdrResponse: data.cdrResponse }),
        ...(data.errorMessage !== undefined && { errorMessage: data.errorMessage }),
        ...(data.sentAt !== undefined && { sentAt: data.sentAt }),
        ...(data.acceptedAt !== undefined && { acceptedAt: data.acceptedAt }),
      },
    });
    return mapInvoice(inv);
  },

  /**
   * Busca facturas pendientes o en reintento para el worker.
   */
  async getPendingInvoices(tenantId: string): Promise<DbSunatInvoice[]> {
    const rows = await prisma.sunatInvoice.findMany({
      where: {
        tenantId,
        sunatStatus: { in: ["pending", "retrying"] },
      },
      orderBy: { createdAt: "asc" },
      take: 50,
    });
    return rows.map(mapInvoice);
  },

  /**
   * Lista todas las facturas del tenant con paginación opcional.
   */
  async listInvoices(
    tenantId: string,
    opts?: {
      status?: SunatInvoiceStatus;
      type?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ invoices: DbSunatInvoice[]; total: number }> {
    const where: Record<string, unknown> = { tenantId };
    if (opts?.status) where.sunatStatus = opts.status;
    if (opts?.type) where.type = opts.type;

    const [invoices, total] = await prisma.$transaction([
      prisma.sunatInvoice.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: opts?.limit ?? 50,
        skip: opts?.offset ?? 0,
      }),
      prisma.sunatInvoice.count({ where }),
    ]);

    return { invoices: invoices.map(mapInvoice), total };
  },

  /**
   * Obtiene una factura por ID con verificación de tenantId.
   */
  async getInvoiceById(
    tenantId: string,
    invoiceId: string
  ): Promise<DbSunatInvoice | null> {
    const inv = await prisma.sunatInvoice.findFirst({
      where: { id: invoiceId, tenantId },
    });
    return inv ? mapInvoice(inv) : null;
  },

  /**
   * Verifica si ya existe un comprobante para un orderId (idempotencia).
   */
  async findByOrderId(
    tenantId: string,
    orderId: string
  ): Promise<DbSunatInvoice | null> {
    const inv = await prisma.sunatInvoice.findFirst({
      where: {
        tenantId,
        orderId,
        sunatStatus: { in: ["accepted", "pending", "retrying"] },
      },
    });
    return inv ? mapInvoice(inv) : null;
  },

  // ── Configuración ────────────────────────────────────────────────────────────

  /**
   * Obtiene la configuración SUNAT del tenant.
   */
  async getConfig(tenantId: string): Promise<DbTenantSunatConfig | null> {
    const cfg = await prisma.tenantSunatConfig.findUnique({
      where: { tenantId },
    });
    return cfg ? mapConfig(cfg) : null;
  },

  /**
   * Incrementa el correlativo de boleta o factura de forma atómica.
   * Retorna el número a usar (pre-incrementado ya aplicado).
   */
  async incrementCorrelativo(
    tenantId: string,
    tipo: "boleta" | "factura"
  ): Promise<number> {
    const field = tipo === "boleta" ? "lastBoletaNum" : "lastFacturaNum";
    const updated = await prisma.tenantSunatConfig.update({
      where: { tenantId },
      data: { [field]: { increment: 1 } },
      select: { lastBoletaNum: true, lastFacturaNum: true },
    });
    return tipo === "boleta" ? updated.lastBoletaNum : updated.lastFacturaNum;
  },
};
