import "server-only";

/**
 * ProductModifiersDB — CRUD para grupos de variaciones de productos.
 *
 * Modelo conceptual:
 *   Product ─< ProductModifierGroup ─< ProductModifierOption
 *
 * Aplicable a cualquier categoria (polleria, ropa, farmacia, restaurante).
 * Tenant-scoped: cada operacion incluye tenantId — nunca cross-tenant.
 *
 * Cache: clave por producto, invalidada en cualquier write.
 */

import { prisma } from "@/lib/prisma";
import { toNumOrZero } from "@/lib/decimal-utils";
import { invalidate, invalidateByPrefix, getOrSet } from "@/lib/cache";

const CACHE_TTL_SEC = 300;

const cacheKey = (tenantId: string, productId: number) =>
  `product-modifiers:${tenantId}:${productId}`;

// ── Types ────────────────────────────────────────────────────────────────────

export interface DbModifierOption {
  id: string;
  groupId: string;
  name: string;
  priceDelta: number;
  position: number;
  isDefault: boolean;
  isActive: boolean;
  imageUrl: string | null;
  tenantId: string;
}

export interface DbModifierGroup {
  id: string;
  productId: number;
  name: string;
  description: string | null;
  required: boolean;
  minSelect: number;
  maxSelect: number;
  position: number;
  isActive: boolean;
  tenantId: string;
  options: DbModifierOption[];
}

export interface UpsertGroupInput {
  id?: string; // si viene → update; si no → create
  productId: number;
  name: string;
  description?: string | null;
  required?: boolean;
  minSelect?: number;
  maxSelect?: number;
  position?: number;
  isActive?: boolean;
}

export interface UpsertOptionInput {
  id?: string;
  groupId: string;
  name: string;
  priceDelta?: number;
  position?: number;
  isDefault?: boolean;
  isActive?: boolean;
  imageUrl?: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

interface RawOption {
  id: string;
  groupId: string;
  name: string;
  priceDelta: unknown;
  position: number;
  isDefault: boolean;
  isActive: boolean;
  imageUrl: string | null;
  tenantId: string;
}

function mapOption(o: RawOption): DbModifierOption {
  return {
    id: o.id,
    groupId: o.groupId,
    name: o.name,
    priceDelta: toNumOrZero(o.priceDelta as Parameters<typeof toNumOrZero>[0]),
    position: o.position,
    isDefault: o.isDefault,
    isActive: o.isActive,
    imageUrl: o.imageUrl,
    tenantId: o.tenantId,
  };
}

function validateGroupBounds(min: number, max: number) {
  if (max < 1) throw new Error("maxSelect must be >= 1");
  if (min < 0) throw new Error("minSelect must be >= 0");
  if (min > max) throw new Error("minSelect must be <= maxSelect");
}

// ── ProductModifiersDB ───────────────────────────────────────────────────────

export const ProductModifiersDB = {
  /** Lista los grupos+opciones activos de un producto, ordenados por position. */
  async listForProduct(
    tenantId: string,
    productId: number,
  ): Promise<DbModifierGroup[]> {
    return getOrSet(cacheKey(tenantId, productId), CACHE_TTL_SEC, async () => {
      const groups = await prisma.productModifierGroup.findMany({
        where: { tenantId, productId, isActive: true },
        include: {
          options: {
            where: { isActive: true },
            orderBy: { position: "asc" },
          },
        },
        orderBy: { position: "asc" },
      });
      return groups.map((g) => ({
        id: g.id,
        productId: g.productId,
        name: g.name,
        description: g.description,
        required: g.required,
        minSelect: g.minSelect,
        maxSelect: g.maxSelect,
        position: g.position,
        isActive: g.isActive,
        tenantId: g.tenantId,
        options: g.options.map(mapOption),
      }));
    });
  },

  /** Lista TODOS los grupos (incluye inactivos) — para admin. */
  async listForProductAdmin(
    tenantId: string,
    productId: number,
  ): Promise<DbModifierGroup[]> {
    const groups = await prisma.productModifierGroup.findMany({
      where: { tenantId, productId },
      include: {
        options: { orderBy: { position: "asc" } },
      },
      orderBy: { position: "asc" },
    });
    return groups.map((g) => ({
      id: g.id,
      productId: g.productId,
      name: g.name,
      description: g.description,
      required: g.required,
      minSelect: g.minSelect,
      maxSelect: g.maxSelect,
      position: g.position,
      isActive: g.isActive,
      tenantId: g.tenantId,
      options: g.options.map(mapOption),
    }));
  },

  /**
   * Lista resumen de productos del tenant con conteo de grupos+opciones.
   * Usado por el VariationsTab admin para mostrar la lista lateral.
   */
  async listProductsSummary(tenantId: string) {
    const products = await prisma.product.findMany({
      where: { tenantId, deletedAt: null, active: true },
      select: {
        id: true,
        name: true,
        category: true,
        image: true,
        price: true,
        modifierGroups: {
          select: {
            id: true,
            options: { select: { id: true } },
          },
        },
      },
      orderBy: { name: "asc" },
    });
    return products.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      image: p.image,
      price: toNumOrZero(p.price),
      groupCount: p.modifierGroups.length,
      optionCount: p.modifierGroups.reduce(
        (sum, g) => sum + g.options.length,
        0,
      ),
    }));
  },

  /** Upsert grupo. Si trae id, actualiza; sino crea. */
  async upsertGroup(
    tenantId: string,
    input: UpsertGroupInput,
  ): Promise<DbModifierGroup> {
    const min = input.minSelect ?? 0;
    const max = input.maxSelect ?? 1;
    validateGroupBounds(min, max);

    const data = {
      productId: input.productId,
      name: input.name,
      description: input.description ?? null,
      required: input.required ?? false,
      minSelect: min,
      maxSelect: max,
      position: input.position ?? 0,
      isActive: input.isActive ?? true,
      tenantId,
    };

    let group;
    if (input.id) {
      // Update — verifica ownership por tenantId
      const existing = await prisma.productModifierGroup.findFirst({
        where: { id: input.id, tenantId },
        select: { id: true },
      });
      if (!existing) throw new Error("Group not found or cross-tenant access");
      group = await prisma.productModifierGroup.update({
        where: { id: input.id },
        data,
        include: { options: { orderBy: { position: "asc" } } },
      });
    } else {
      group = await prisma.productModifierGroup.create({
        data,
        include: { options: { orderBy: { position: "asc" } } },
      });
    }

    invalidate(cacheKey(tenantId, input.productId));
    invalidateByPrefix(`marketplace:store-products:`);

    return {
      id: group.id,
      productId: group.productId,
      name: group.name,
      description: group.description,
      required: group.required,
      minSelect: group.minSelect,
      maxSelect: group.maxSelect,
      position: group.position,
      isActive: group.isActive,
      tenantId: group.tenantId,
      options: group.options.map(mapOption),
    };
  },

  /** Borra grupo (cascade a opciones via FK). */
  async deleteGroup(tenantId: string, groupId: string): Promise<void> {
    const existing = await prisma.productModifierGroup.findFirst({
      where: { id: groupId, tenantId },
      select: { id: true, productId: true },
    });
    if (!existing) throw new Error("Group not found or cross-tenant access");

    await prisma.productModifierGroup.delete({ where: { id: groupId } });
    invalidate(cacheKey(tenantId, existing.productId));
    invalidateByPrefix(`marketplace:store-products:`);
  },

  /** Upsert option. Si trae id, actualiza; sino crea. */
  async upsertOption(
    tenantId: string,
    input: UpsertOptionInput,
  ): Promise<DbModifierOption> {
    // Verifica ownership del group via tenantId
    const group = await prisma.productModifierGroup.findFirst({
      where: { id: input.groupId, tenantId },
      select: { id: true, productId: true },
    });
    if (!group) throw new Error("Group not found or cross-tenant access");

    const data = {
      groupId: input.groupId,
      name: input.name,
      priceDelta: input.priceDelta ?? 0,
      position: input.position ?? 0,
      isDefault: input.isDefault ?? false,
      isActive: input.isActive ?? true,
      imageUrl: input.imageUrl ?? null,
      tenantId,
    };

    let option;
    if (input.id) {
      const existing = await prisma.productModifierOption.findFirst({
        where: { id: input.id, tenantId },
        select: { id: true },
      });
      if (!existing) throw new Error("Option not found or cross-tenant access");
      option = await prisma.productModifierOption.update({
        where: { id: input.id },
        data,
      });
    } else {
      option = await prisma.productModifierOption.create({ data });
    }

    invalidate(cacheKey(tenantId, group.productId));
    invalidateByPrefix(`marketplace:store-products:`);
    return mapOption(option);
  },

  /** Borra option. */
  async deleteOption(tenantId: string, optionId: string): Promise<void> {
    const existing = await prisma.productModifierOption.findFirst({
      where: { id: optionId, tenantId },
      select: { id: true, group: { select: { productId: true } } },
    });
    if (!existing) throw new Error("Option not found or cross-tenant access");

    await prisma.productModifierOption.delete({ where: { id: optionId } });
    invalidate(cacheKey(tenantId, existing.group.productId));
    invalidateByPrefix(`marketplace:store-products:`);
  },

  /**
   * Reordena grupos por posicion. Recibe array de ids en el orden deseado.
   * Use en drag-and-drop del admin.
   */
  async reorderGroups(
    tenantId: string,
    productId: number,
    orderedIds: string[],
  ): Promise<void> {
    await prisma.$transaction(
      orderedIds.map((id, idx) =>
        prisma.productModifierGroup.updateMany({
          where: { id, tenantId, productId },
          data: { position: idx },
        }),
      ),
    );
    invalidate(cacheKey(tenantId, productId));
    invalidateByPrefix(`marketplace:store-products:`);
  },

  /** Reordena opciones dentro de un grupo. */
  async reorderOptions(
    tenantId: string,
    groupId: string,
    orderedIds: string[],
  ): Promise<void> {
    const group = await prisma.productModifierGroup.findFirst({
      where: { id: groupId, tenantId },
      select: { productId: true },
    });
    if (!group) throw new Error("Group not found or cross-tenant access");

    await prisma.$transaction(
      orderedIds.map((id, idx) =>
        prisma.productModifierOption.updateMany({
          where: { id, tenantId, groupId },
          data: { position: idx },
        }),
      ),
    );
    invalidate(cacheKey(tenantId, group.productId));
    invalidateByPrefix(`marketplace:store-products:`);
  },

  /**
   * Lookup batch para validation server-side en checkout.
   * Recibe ids de opciones, devuelve sus priceDelta autoritativos.
   */
  async getOptionsByIds(
    tenantId: string,
    optionIds: string[],
  ): Promise<DbModifierOption[]> {
    if (optionIds.length === 0) return [];
    const options = await prisma.productModifierOption.findMany({
      where: { tenantId, id: { in: optionIds }, isActive: true },
    });
    return options.map(mapOption);
  },

  /**
   * Lookup individual scoped por tenantId. A diferencia de `getOptionsByIds`,
   * incluye opciones inactivas — útil para el PATCH del admin que puede
   * reactivarlas. Devuelve null si no existe o pertenece a otro tenant.
   */
  async getOptionById(
    tenantId: string,
    optionId: string,
  ): Promise<DbModifierOption | null> {
    const row = await prisma.productModifierOption.findFirst({
      where: { id: optionId, tenantId },
    });
    return row ? mapOption(row) : null;
  },
};
