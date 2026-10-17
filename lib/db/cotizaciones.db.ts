import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { CotizacionCambioDeEstadoError } from "@/lib/cotizaciones/estados";
import type {
  Cotizacion as PCotizacion,
  CotizacionItem as PCotizacionItem,
  Prisma,
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
    // El nombre configurado y, si está vacío (Blas: ""), el registrado: es el
    // mismo respaldo que el membrete. Antes caía en «Buleje» y el cliente de
    // cualquier negocio recibía «Cotización Buleje-COT-0001».
    const [settings, tenant] = await Promise.all([
      prisma.settings.findFirst({ where: { tenantId }, select: { businessName: true } }),
      prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
    ]);
    const nombre = settings?.businessName?.trim() || tenant?.name?.trim() || "";
    if (nombre) {
      // Use first 3 letters of business name
      const prefix = nombre
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
  return "DOC";
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

  /**
   * `siEstadoEs` (seguridad 17-10, punto 2): el cambio de estado sólo se
   * escribe si la cotización sigue como se leyó. Sin eso, «Enviada» de una
   * pestaña vieja pisaba una CONVERTIDA recién hecha y quedaba lista para un
   * segundo pedido. Si perdió la carrera: `CotizacionCambioDeEstadoError`.
   */
  async update(
    id: string,
    tenantId: string,
    data: { status?: string; notas?: string; validoHasta?: Date },
    opts?: { siEstadoEs?: string },
  ): Promise<DbCotizacion | null> {
    const existing = await prisma.cotizacion.findFirst({
      where: { id, tenantId },
    });
    if (!existing) return null;
    const res = await prisma.cotizacion.updateMany({
      where: { id, tenantId, ...(opts?.siEstadoEs ? { status: opts.siEstadoEs as never } : {}) },
      data: {
        ...(data.status && { status: data.status as never }),
        ...(data.notas !== undefined && { notas: data.notas }),
        ...(data.validoHasta && { validoHasta: data.validoHasta }),
      },
    });
    const row = await prisma.cotizacion.findFirst({ where: { id, tenantId }, include: { items: true } });
    if (!row) return null;
    if (res.count === 0) throw new CotizacionCambioDeEstadoError(row.status);
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

  // ── F25: elegir el cliente ────────────────────────────────────────────────

  /**
   * Clientes del negocio que coinciden con lo escrito (nombre, razón social,
   * documento o celular). Sin caché: el que se acaba de dar de alta tiene que
   * salir en la búsqueda siguiente.
   */
  async buscarClientes(tenantId: string, q: string, limite = 8): Promise<ClienteParaCotizar[]> {
    const texto = q.trim();
    if (texto.length < 2) return [];
    const digitos = texto.replace(/\D/g, "");
    const or: Prisma.CustomerWhereInput[] = [
      { name: { contains: texto, mode: "insensitive" } },
      { razonSocial: { contains: texto, mode: "insensitive" } },
    ];
    if (digitos.length >= 3) or.push({ documento: { contains: digitos } }, { phone: { contains: digitos } });
    const filas = await prisma.customer.findMany({
      where: { tenantId, OR: or },
      select: SELECT_CLIENTE,
      orderBy: { updatedAt: "desc" },
      take: Math.min(Math.max(limite, 1), 20),
    });
    return filas.map(aClienteParaCotizar);
  },

  /** El cliente de este negocio con ese celular, o null (el FK va por `phone`, que es único en TODA la plataforma). */
  async clienteDelNegocio(tenantId: string, phone: string): Promise<ClienteParaCotizar | null> {
    const fila = await prisma.customer.findFirst({ where: { tenantId, phone }, select: SELECT_CLIENTE });
    return fila ? aClienteParaCotizar(fila) : null;
  },

  // ── F26: lo que hay de cada producto ──────────────────────────────────────

  /** Existencias de HOY (sin la caché de 5 min del catálogo) de los productos del negocio. */
  async productosParaCotizar(tenantId: string, ids: readonly number[]): Promise<ProductoParaCotizar[]> {
    const unicos = [...new Set(ids.filter((n) => Number.isSafeInteger(n) && n > 0))].slice(0, 100);
    if (unicos.length === 0) return [];
    const filas = await prisma.product.findMany({
      where: { tenantId, id: { in: unicos }, deletedAt: null },
      select: { id: true, name: true, unit: true, type: true, stock: true, stockMin: true, active: true },
    });
    return filas.map((p) => ({
      id: p.id,
      nombre: p.name,
      unidad: p.unit,
      tipo: p.type,
      stock: p.stock,
      stockMin: p.stockMin,
      activo: p.active,
    }));
  },
};

export type ClienteParaCotizar = {
  /** Celular normalizado: es la clave a la que apunta `Cotizacion.customerId`. */
  phone: string;
  nombre: string;
  razonSocial?: string;
  documento?: string;
  tipoDocumento?: string;
};

export type ProductoParaCotizar = {
  id: number;
  nombre: string;
  unidad: string;
  tipo: string;
  stock: number | null;
  stockMin: number | null;
  activo: boolean;
};

const SELECT_CLIENTE = {
  phone: true,
  name: true,
  razonSocial: true,
  documento: true,
  tipoDocumento: true,
} as const;

function aClienteParaCotizar(c: {
  phone: string;
  name: string;
  razonSocial: string | null;
  documento: string | null;
  tipoDocumento: string | null;
}): ClienteParaCotizar {
  return {
    phone: c.phone,
    nombre: c.name,
    ...(c.razonSocial && { razonSocial: c.razonSocial }),
    ...(c.documento && { documento: c.documento }),
    ...(c.tipoDocumento && { tipoDocumento: c.tipoDocumento }),
  };
}
