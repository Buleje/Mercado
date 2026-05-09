import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import type {
  Cotizacion as PCotizacion,
  CotizacionItem as PCotizacionItem,
} from "@/lib/generated/prisma/client";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DbCotizacionItem = {
  id: string;
  productoId?: string;
  descripcion: string;
  cantidad: number;
  precioUnit: number;
  descuento: number;
  subtotal: number;
};

export type DbCotizacion = {
  id: string;
  tenantId: string;
  numero: string;
  customerId?: string;
  clienteNombre: string;
  clienteRuc?: string;
  validoHasta: string;
  status: string;
  subtotal: number;
  igv: number;
  total: number;
  notas?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  items: DbCotizacionItem[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function toISO(d: Date): string {
  return d.toISOString();
}

function dec(v: unknown): number {
  return typeof v === "number" ? v : Number(v);
}

// ── Mappers ───────────────────────────────────────────────────────────────────

function mapItem(i: PCotizacionItem): DbCotizacionItem {
  return {
    id: i.id,
    ...(i.productoId != null && { productoId: i.productoId }),
    descripcion: i.descripcion,
    cantidad: dec(i.cantidad),
    precioUnit: dec(i.precioUnit),
    descuento: dec(i.descuento),
    subtotal: dec(i.subtotal),
  };
}

function mapCotizacion(
  c: PCotizacion & { items: PCotizacionItem[] }
): DbCotizacion {
  return {
    id: c.id,
    tenantId: c.tenantId,
    numero: c.numero,
    ...(c.customerId != null && { customerId: c.customerId }),
    clienteNombre: c.clienteNombre,
    ...(c.clienteRuc != null && { clienteRuc: c.clienteRuc }),
    validoHasta: toISO(c.validoHasta),
    status: c.status,
    subtotal: dec(c.subtotal),
    igv: dec(c.igv),
    total: dec(c.total),
    ...(c.notas != null && { notas: c.notas }),
    createdBy: c.createdBy,
    createdAt: toISO(c.createdAt),
    updatedAt: toISO(c.updatedAt),
    items: c.items.map(mapItem),
  };
}

// ── Cotizaciones DB ───────────────────────────────────────────────────────────

// ── Mejora 18: Prefijo configurable ─────────────────────────────────────────

async function getDocPrefix(tenantId: string): Promise<string> {
  try {
    const settings = await prisma.settings.findFirst({
      where: { tenantId },
      select: { businessName: true },
    });
    if (settings?.businessName) {
      // Use first 3 letters of business name
      const prefix = settings.businessName
        .replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ\s]/g, "")
        .trim()
        .slice(0, 3)
        .toUpperCase();
      if (prefix.length >= 2) return prefix;
    }
  } catch (e) {
    logger.error(
      "getDocPrefix failed — using default prefix",
      { err: e instanceof Error ? e.message : String(e), op: "CotizacionesDB.getDocPrefix", tenantId },
    );
  }
  return "Buleje";
}

export const CotizacionesDB = {
  async siguienteNumero(tenantId: string): Promise<string> {
    const prefix = await getDocPrefix(tenantId);
    const last = await prisma.cotizacion.findFirst({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      select: { numero: true },
    });
    // Strip any prefix to get the sequential number
    const numMatch = last?.numero?.match(/(\d+)$/);
    const seq = numMatch ? parseInt(numMatch[1], 10) + 1 : 1;
    return `${prefix}-COT-${String(seq).padStart(4, "0")}`;
  },

  async getAll(
    tenantId: string,
    opts?: {
      status?: string;
      customerId?: string;
      search?: string;
      from?: string;
      to?: string;
    }
  ): Promise<DbCotizacion[]> {
    const where: Record<string, unknown> = { tenantId };
    if (opts?.status) where.status = opts.status;
    if (opts?.customerId) where.customerId = opts.customerId;
    if (opts?.search) {
      where.OR = [
        { clienteNombre: { contains: opts.search, mode: "insensitive" } },
        { numero: { contains: opts.search, mode: "insensitive" } },
      ];
    }
    if (opts?.from || opts?.to) {
      const createdAt: Record<string, Date> = {};
      if (opts.from) createdAt.gte = new Date(opts.from);
      if (opts.to) createdAt.lte = new Date(opts.to);
      where.createdAt = createdAt;
    }
    return (
      await prisma.cotizacion.findMany({
        where,
        include: { items: true },
        orderBy: { createdAt: "desc" },
      })
    ).map(mapCotizacion);
  },

  async getById(
    id: string,
    tenantId: string
  ): Promise<DbCotizacion | null> {
    const row = await prisma.cotizacion.findFirst({
      where: { id, tenantId },
      include: { items: true },
    });
    return row ? mapCotizacion(row) : null;
  },

  async create(
    tenantId: string,
    data: {
      numero: string;
      clienteNombre: string;
      clienteRuc?: string;
      customerId?: string;
      validoHasta: Date;
      subtotal: number;
      igv: number;
      total: number;
      notas?: string;
      createdBy: string;
      items: {
        descripcion: string;
        cantidad: number;
        precioUnit: number;
        descuento?: number;
        productoId?: string;
        subtotal: number;
      }[];
    }
  ): Promise<DbCotizacion> {
    const row = await prisma.cotizacion.create({
      data: {
        tenantId,
        numero: data.numero,
        clienteNombre: data.clienteNombre,
        clienteRuc: data.clienteRuc,
        customerId: data.customerId,
        validoHasta: data.validoHasta,
        subtotal: data.subtotal,
        igv: data.igv,
        total: data.total,
        notas: data.notas,
        createdBy: data.createdBy,
        items: {
          create: data.items.map((i) => ({
            descripcion: i.descripcion,
            cantidad: i.cantidad,
            precioUnit: i.precioUnit,
            descuento: i.descuento ?? 0,
            productoId: i.productoId,
            subtotal: i.subtotal,
          })),
        },
      },
      include: { items: true },
    });
    return mapCotizacion(row);
  },

  async update(
    id: string,
    tenantId: string,
    data: { status?: string; notas?: string; validoHasta?: Date }
  ): Promise<DbCotizacion | null> {
    const existing = await prisma.cotizacion.findFirst({
      where: { id, tenantId },
    });
    if (!existing) return null;
    const row = await prisma.cotizacion.update({
      where: { id },
      data: {
        ...(data.status && { status: data.status as never }),
        ...(data.notas !== undefined && { notas: data.notas }),
        ...(data.validoHasta && { validoHasta: data.validoHasta }),
      },
      include: { items: true },
    });
    return mapCotizacion(row);
  },

  async delete(id: string, tenantId: string): Promise<boolean> {
    const existing = await prisma.cotizacion.findFirst({
      where: { id, tenantId, status: "BORRADOR" },
    });
    if (!existing) return false;
    await prisma.cotizacion.delete({ where: { id } });
    return true;
  },
};
