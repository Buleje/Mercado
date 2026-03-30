import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DbRecetaIngrediente = {
  id: string;
  recetaId: string;
  productoId: number;
  cantidad: number;
  unidad: string;
};

export type DbReceta = {
  id: string;
  tenantId: string;
  nombre: string;
  descripcion?: string;
  productoId?: number;
  costoTotal: number;
  activa: boolean;
  ingredientes: DbRecetaIngrediente[];
  createdAt: string;
  updatedAt: string;
};

export type DbProduccionLote = {
  id: string;
  tenantId: string;
  recetaId: string;
  cantidad: number;
  costoReal: number;
  notas?: string;
  producidoEn: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function toISO(d: Date): string {
  return d.toISOString();
}

function toNum(d: Prisma.Decimal | null | undefined): number {
  return d ? Number(d) : 0;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapIngrediente(i: any): DbRecetaIngrediente {
  return {
    id: i.id,
    recetaId: i.recetaId,
    productoId: i.productoId,
    cantidad: toNum(i.cantidad),
    unidad: i.unidad,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapReceta(r: any): DbReceta {
  return {
    id: r.id,
    tenantId: r.tenantId,
    nombre: r.nombre,
    ...(r.descripcion != null && { descripcion: r.descripcion }),
    ...(r.productoId != null && { productoId: r.productoId }),
    costoTotal: toNum(r.costoTotal),
    activa: r.activa,
    ingredientes: (r.ingredientes ?? []).map(mapIngrediente),
    createdAt: toISO(r.createdAt),
    updatedAt: toISO(r.updatedAt),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapProduccion(p: any): DbProduccionLote {
  return {
    id: p.id,
    tenantId: p.tenantId,
    recetaId: p.recetaId,
    cantidad: toNum(p.cantidad),
    costoReal: toNum(p.costoReal),
    ...(p.notas != null && { notas: p.notas }),
    producidoEn: toISO(p.producidoEn),
  };
}

// ── Recetas DB ────────────────────────────────────────────────────────────────

export const RecetasDB = {
  async list(tenantId: string): Promise<DbReceta[]> {
    const rows = await prisma.receta.findMany({
      where: { tenantId },
      include: { ingredientes: true },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(mapReceta);
  },

  async getById(id: string): Promise<DbReceta | null> {
    const row = await prisma.receta.findUnique({
      where: { id },
      include: { ingredientes: true },
    });
    return row ? mapReceta(row) : null;
  },

  async create(data: {
    tenantId: string;
    nombre: string;
    descripcion?: string;
    productoId?: number;
    ingredientes: { productoId: number; cantidad: number; unidad?: string }[];
  }): Promise<DbReceta> {
    const row = await prisma.receta.create({
      data: {
        tenantId: data.tenantId,
        nombre: data.nombre,
        descripcion: data.descripcion,
        productoId: data.productoId,
        ingredientes: {
          create: data.ingredientes.map((i) => ({
            productoId: i.productoId,
            cantidad: i.cantidad,
            unidad: i.unidad ?? "unidad",
          })),
        },
      },
      include: { ingredientes: true },
    });

    // Auto-calculate cost after creation
    const costo = await this.calcularCosto(row.id);
    if (costo > 0) {
      const updated = await prisma.receta.update({
        where: { id: row.id },
        data: { costoTotal: costo },
        include: { ingredientes: true },
      });
      return mapReceta(updated);
    }

    return mapReceta(row);
  },

  async calcularCosto(recetaId: string): Promise<number> {
    const receta = await prisma.receta.findUnique({
      where: { id: recetaId },
      include: { ingredientes: { include: { producto: true } } },
    });
    if (!receta) return 0;

    let total = 0;
    for (const ing of receta.ingredientes) {
      const costUnit = ing.producto.costPrice ?? ing.producto.price;
      total += costUnit * Number(ing.cantidad);
    }

    await prisma.receta.update({
      where: { id: recetaId },
      data: { costoTotal: total },
    });

    return total;
  },

  async registrarProduccion(data: {
    tenantId: string;
    recetaId: string;
    cantidad: number;
    costoReal?: number;
    notas?: string;
  }): Promise<DbProduccionLote> {
    const row = await prisma.produccionLote.create({
      data: {
        tenantId: data.tenantId,
        recetaId: data.recetaId,
        cantidad: data.cantidad,
        costoReal: data.costoReal ?? 0,
        notas: data.notas,
      },
    });
    return mapProduccion(row);
  },
};
