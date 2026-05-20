import "server-only";
import { prisma } from "@/lib/prisma";
import { toNumOrZero } from "@/lib/decimal-utils";

/**
 * DocumentosEmitidosDB
 *
 * Audit project-wide 2026-05-19 — migracion de /api/documentos-emitidos.
 * Agregado cross-entity de comprobantes (boletas/facturas/cotizaciones/guias/NCs)
 * para el feed unificado de documentos emitidos del admin.
 */

export type FuenteDoc = "venta" | "cotizacion" | "guia" | "nc";

export interface DocItem {
  id: string;
  tipo: string;
  numero: string;
  cliente: string;
  ruc?: string;
  total: number;
  fecha: string;
  estado: string;
  fuente: FuenteDoc;
}

interface ListOpts {
  tipo?: string;
  search?: string;
  from?: Date;
  to?: Date;
}

export const DocumentosEmitidosDB = {
  /**
   * Lista ventas con comprobante (boleta/factura/cotizacion/proforma).
   * Filtra ticket si no se pidió tipo específico.
   */
  async listVentas(tenantId: string, opts: ListOpts): Promise<DocItem[]> {
    if (opts.tipo && !["boleta", "factura", "cotizacion", "proforma"].includes(opts.tipo)) {
      return [];
    }
    const dateFilter = this._dateFilter(opts);
    const ventas = await prisma.sale.findMany({
      where: {
        tenantId,
        comprobanteTipo: opts.tipo ? opts.tipo : { not: "ticket" },
        ...(dateFilter ? { createdAt: dateFilter } : {}),
        ...(opts.search
          ? {
              OR: [
                { comprobanteNumero: { contains: opts.search, mode: "insensitive" as const } },
                { customerPhone: { contains: opts.search, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        comprobanteTipo: true,
        comprobanteNumero: true,
        comprobanteRuc: true,
        customerPhone: true,
        total: true,
        createdAt: true,
      },
    });
    return ventas.map((v) => ({
      id: v.id,
      tipo: v.comprobanteTipo || "ticket",
      numero: v.comprobanteNumero || v.id.substring(0, 8),
      cliente: v.customerPhone || "Sin cliente",
      ruc: v.comprobanteRuc ?? undefined,
      total: toNumOrZero(v.total),
      fecha: v.createdAt.toISOString(),
      estado: "emitido",
      fuente: "venta" as const,
    }));
  },

  async listCotizaciones(tenantId: string, opts: ListOpts): Promise<DocItem[]> {
    if (opts.tipo && opts.tipo !== "cotizacion") return [];
    const dateFilter = this._dateFilter(opts);
    try {
      const cotizaciones = await prisma.cotizacion.findMany({
        where: {
          tenantId,
          ...(dateFilter ? { createdAt: dateFilter } : {}),
          ...(opts.search
            ? {
                OR: [
                  { numero: { contains: opts.search, mode: "insensitive" as const } },
                  { clienteNombre: { contains: opts.search, mode: "insensitive" as const } },
                ],
              }
            : {}),
        },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, numero: true, clienteNombre: true, total: true, status: true, createdAt: true },
      });
      return cotizaciones.map((c) => ({
        id: c.id,
        tipo: "cotizacion",
        numero: c.numero,
        cliente: c.clienteNombre,
        total: Number(c.total),
        fecha: c.createdAt.toISOString(),
        estado: c.status.toLowerCase(),
        fuente: "cotizacion" as const,
      }));
    } catch {
      return [];
    }
  },

  async listGuias(tenantId: string, opts: ListOpts): Promise<DocItem[]> {
    if (opts.tipo && opts.tipo !== "grr") return [];
    const dateFilter = this._dateFilter(opts);
    try {
      const guias = await prisma.guiaRemision.findMany({
        where: {
          tenantId,
          ...(dateFilter ? { createdAt: dateFilter } : {}),
          ...(opts.search
            ? {
                OR: [
                  { numero: { contains: opts.search, mode: "insensitive" as const } },
                  { destinatarioNombre: { contains: opts.search, mode: "insensitive" as const } },
                ],
              }
            : {}),
        },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, numero: true, destinatarioNombre: true, status: true, createdAt: true },
      });
      return guias.map((g) => ({
        id: g.id,
        tipo: "grr",
        numero: g.numero,
        cliente: g.destinatarioNombre,
        total: 0,
        fecha: g.createdAt.toISOString(),
        estado: g.status.toLowerCase(),
        fuente: "guia" as const,
      }));
    } catch {
      return [];
    }
  },

  async listNotasCredito(tenantId: string, opts: ListOpts): Promise<DocItem[]> {
    if (opts.tipo && opts.tipo !== "nc") return [];
    const dateFilter = this._dateFilter(opts);
    try {
      const ncs = await prisma.notaCredito.findMany({
        where: {
          tenantId,
          ...(dateFilter ? { createdAt: dateFilter } : {}),
          ...(opts.search ? { numero: { contains: opts.search, mode: "insensitive" as const } } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, numero: true, total: true, status: true, createdAt: true },
      });
      return ncs.map((nc) => ({
        id: nc.id,
        tipo: "nc",
        numero: nc.numero,
        cliente: "-",
        total: Number(nc.total),
        fecha: nc.createdAt.toISOString(),
        estado: nc.status.toLowerCase(),
        fuente: "nc" as const,
      }));
    } catch {
      return [];
    }
  },

  /**
   * Lista TODOS los documentos (cross-entity) en paralelo. Útil para el
   * feed unificado del admin. Cada sub-lookup tolera errores (try/catch
   * dentro de cada método).
   */
  async listAll(tenantId: string, opts: ListOpts): Promise<DocItem[]> {
    const [ventas, cotizaciones, guias, ncs] = await Promise.all([
      this.listVentas(tenantId, opts),
      this.listCotizaciones(tenantId, opts),
      this.listGuias(tenantId, opts),
      this.listNotasCredito(tenantId, opts),
    ]);
    return [...ventas, ...cotizaciones, ...guias, ...ncs]
      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
  },

  _dateFilter(opts: ListOpts): Record<string, Date> | null {
    const f: Record<string, Date> = {};
    if (opts.from) f.gte = opts.from;
    if (opts.to) f.lte = opts.to;
    return Object.keys(f).length > 0 ? f : null;
  },
};
