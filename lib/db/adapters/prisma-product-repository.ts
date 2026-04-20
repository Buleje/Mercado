import "server-only";
// Adapter: implementa ProductRepository usando Prisma.
// NO toca lib/db/products.db.ts — es un adapter nuevo e independiente.

import { prisma } from "@/lib/prisma";
import type { ProductRepository } from "@/domain/product/product-repository";
import { Product } from "@/domain/product/product";
import { Money } from "@/domain/order/value-objects";
import type { Product as PProduct } from "@/lib/generated/prisma/client";
import { toNumOrZero } from "@/lib/decimal-utils";

// ── Mapper Prisma → Domain ────────────────────────────────────────────────────

function toDomain(row: PProduct): Product {
  const currency = "PEN" as const;
  const price     = Money.rehydrate(toNumOrZero(row.price), currency);
  const costPrice = row.costPrice != null
    ? Money.rehydrate(toNumOrZero(row.costPrice), currency)
    : undefined;

  return Product.rehydrate({
    id:          row.id,
    tenantId:    row.tenantId,
    name:        row.name,
    category:    row.category,
    price,
    costPrice,
    unit:        row.unit,
    image:       row.image,
    description: row.description ?? undefined,
    badge:       row.badge ?? undefined,
    barcode:     row.barcode ?? undefined,
    stock:       row.stock ?? undefined,
    active:      row.active,
  });
}

// ── PrismaProductRepository ───────────────────────────────────────────────────

export class PrismaProductRepository implements ProductRepository {
  async findById(tenantId: string, id: number): Promise<Product | null> {
    const row = await prisma.product.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!row) return null;
    return toDomain(row);
  }

  async findActive(tenantId: string): Promise<Product[]> {
    const rows = await prisma.product.findMany({
      where: { tenantId, active: true, deletedAt: null },
      orderBy: { id: "asc" },
    });
    return rows.map(toDomain);
  }

  async save(product: Product): Promise<void> {
    await prisma.product.upsert({
      where: { id: product.id },
      update: {
        name:        product.name,
        category:    product.category,
        price:       product.price.amount,
        costPrice:   product.costPrice?.amount ?? null,
        unit:        product.unit,
        image:       product.image,
        description: product.description ?? null,
        badge:       product.badge ?? null,
        barcode:     product.barcode ?? null,
        stock:       product.stock ?? null,
        active:      product.active,
      },
      create: {
        id:          product.id,
        tenantId:    product.tenantId,
        name:        product.name,
        category:    product.category,
        price:       product.price.amount,
        costPrice:   product.costPrice?.amount ?? null,
        unit:        product.unit,
        image:       product.image,
        description: product.description ?? null,
        badge:       product.badge ?? null,
        barcode:     product.barcode ?? null,
        stock:       product.stock ?? null,
        active:      product.active,
      },
    });
  }
}
