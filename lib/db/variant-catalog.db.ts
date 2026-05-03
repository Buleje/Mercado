import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * lib/db/variant-catalog.db.ts
 *
 * Acceso a las tablas globales del Variant Catalog (gestionadas por superadmin).
 * NO multi-tenant — el catálogo es global del SaaS, no por tenant.
 *
 * Métodos:
 *  - listTemplates({ category?, publishedOnly? })  → lista templates con options
 *  - getTemplate(id)                                → un template + options
 *  - createTemplate(data)                           → nuevo template (superadmin)
 *  - updateTemplate(id, patch)                      → editar template
 *  - deleteTemplate(id)                             → borrar (cascade options)
 *  - createOption(templateId, data)                 → añadir option
 *  - updateOption(id, patch)                        → editar option
 *  - deleteOption(id)                               → borrar option
 *  - importToProduct(tenantId, productId, templateId)
 *      → clona el template + options en ProductModifierGroup + ProductModifierOption
 *        del tenant. Es una COPIA, no referencia. Cada tenant edita su versión.
 */

export type DbVariantCatalogOption = {
  id: string;
  templateId: string;
  name: string;
  imageUrl: string | null;
  priceDelta: number;
  position: number;
  isDefault: boolean;
};

export type DbVariantCatalogTemplate = {
  id: string;
  category: string;
  name: string;
  description: string | null;
  required: boolean;
  minSelect: number;
  maxSelect: number;
  position: number;
  isPublished: boolean;
  options: DbVariantCatalogOption[];
};

function mapOption(o: {
  id: string;
  templateId: string;
  name: string;
  imageUrl: string | null;
  // Prisma Decimal serializa a algo con toString/toNumber/toFixed; aceptamos
  // tambien number plano para tests/seed.
  priceDelta: number | { toString(): string; toNumber?: () => number; toFixed?: (d?: number) => string };
  position: number;
  isDefault: boolean;
}): DbVariantCatalogOption {
  return {
    id: o.id,
    templateId: o.templateId,
    name: o.name,
    imageUrl: o.imageUrl,
    priceDelta: typeof o.priceDelta === "number" ? o.priceDelta : Number(o.priceDelta.toString()),
    position: o.position,
    isDefault: o.isDefault,
  };
}

function mapTemplate(
  t: {
    id: string;
    category: string;
    name: string;
    description: string | null;
    required: boolean;
    minSelect: number;
    maxSelect: number;
    position: number;
    isPublished: boolean;
    options: Parameters<typeof mapOption>[0][];
  },
): DbVariantCatalogTemplate {
  return {
    id: t.id,
    category: t.category,
    name: t.name,
    description: t.description,
    required: t.required,
    minSelect: t.minSelect,
    maxSelect: t.maxSelect,
    position: t.position,
    isPublished: t.isPublished,
    options: t.options.map(mapOption),
  };
}

export class VariantCatalogDb {
  static async listTemplates(opts: { category?: string; publishedOnly?: boolean } = {}): Promise<DbVariantCatalogTemplate[]> {
    const rows = await prisma.variantCatalogTemplate.findMany({
      where: {
        ...(opts.category ? { category: opts.category } : {}),
        ...(opts.publishedOnly ? { isPublished: true } : {}),
      },
      orderBy: [{ category: "asc" }, { position: "asc" }, { createdAt: "asc" }],
      include: { options: { orderBy: { position: "asc" } } },
    });
    return rows.map(mapTemplate);
  }

  static async getTemplate(id: string): Promise<DbVariantCatalogTemplate | null> {
    const row = await prisma.variantCatalogTemplate.findUnique({
      where: { id },
      include: { options: { orderBy: { position: "asc" } } },
    });
    return row ? mapTemplate(row) : null;
  }

  static async createTemplate(data: {
    category: string;
    name: string;
    description?: string | null;
    required?: boolean;
    minSelect?: number;
    maxSelect?: number;
    position?: number;
    isPublished?: boolean;
  }): Promise<DbVariantCatalogTemplate> {
    const row = await prisma.variantCatalogTemplate.create({
      data: {
        category: data.category,
        name: data.name,
        description: data.description ?? null,
        required: data.required ?? false,
        minSelect: data.minSelect ?? 0,
        maxSelect: data.maxSelect ?? 1,
        position: data.position ?? 0,
        isPublished: data.isPublished ?? true,
      },
      include: { options: true },
    });
    return mapTemplate(row);
  }

  static async updateTemplate(
    id: string,
    patch: Partial<{
      category: string;
      name: string;
      description: string | null;
      required: boolean;
      minSelect: number;
      maxSelect: number;
      position: number;
      isPublished: boolean;
    }>,
  ): Promise<DbVariantCatalogTemplate> {
    const row = await prisma.variantCatalogTemplate.update({
      where: { id },
      data: patch,
      include: { options: { orderBy: { position: "asc" } } },
    });
    return mapTemplate(row);
  }

  static async deleteTemplate(id: string): Promise<void> {
    await prisma.variantCatalogTemplate.delete({ where: { id } });
  }

  static async createOption(
    templateId: string,
    data: {
      name: string;
      imageUrl?: string | null;
      priceDelta?: number;
      position?: number;
      isDefault?: boolean;
    },
  ): Promise<DbVariantCatalogOption> {
    const row = await prisma.variantCatalogOption.create({
      data: {
        templateId,
        name: data.name,
        imageUrl: data.imageUrl ?? null,
        priceDelta: data.priceDelta ?? 0,
        position: data.position ?? 0,
        isDefault: data.isDefault ?? false,
      },
    });
    return mapOption(row);
  }

  static async updateOption(
    id: string,
    patch: Partial<{ name: string; imageUrl: string | null; priceDelta: number; position: number; isDefault: boolean }>,
  ): Promise<DbVariantCatalogOption> {
    const row = await prisma.variantCatalogOption.update({ where: { id }, data: patch });
    return mapOption(row);
  }

  static async deleteOption(id: string): Promise<void> {
    await prisma.variantCatalogOption.delete({ where: { id } });
  }

  /**
   * Clona un template del catálogo global a las tablas del tenant
   * (ProductModifierGroup + ProductModifierOption).
   *
   * Es COPIA — cada tenant tiene su propia versión y puede modificarla
   * sin afectar al catálogo global.
   *
   * Garantías (post-audit P0):
   * - **Atómico**: todo dentro de `$transaction`. Si falla la creación de
   *   options se revierte el group — nunca queda un grupo huérfano que
   *   muestre cero variaciones en POS/storefront.
   * - **Idempotente**: si ya existe un grupo activo con el mismo nombre
   *   en el producto del tenant → 409 (no duplica). Permite retries
   *   seguros desde el cliente sin generar N grupos basura.
   */
  static async importToProduct(
    tenantId: string,
    productId: number,
    templateId: string,
    optionIds?: string[],
  ): Promise<{ groupId: string; optionsCount: number; alreadyExists?: boolean; addedOptions?: number }> {
    return prisma.$transaction(async (tx) => {
      const template = await tx.variantCatalogTemplate.findUnique({
        where: { id: templateId },
        include: { options: { orderBy: { position: "asc" } } },
      });
      if (!template) throw new Error("Template no encontrado");

      // Filtra options si se pasaron optionIds (modo selectivo)
      const filteredOptions = optionIds && optionIds.length > 0
        ? template.options.filter((o) => optionIds.includes(o.id))
        : template.options;
      if (filteredOptions.length === 0 && optionIds && optionIds.length > 0) {
        throw new Error("Las opciones seleccionadas no existen en este template");
      }

      // Verifica que el producto pertenece al tenant (multi-tenant guard)
      const product = await tx.product.findFirst({
        where: { id: productId, tenantId },
        select: { id: true },
      });
      if (!product) throw new Error("Producto no pertenece al tenant");

      // Idempotency: si existe grupo con mismo nombre, MERGE en vez de duplicar.
      // En modo selectivo (optionIds) agregamos solo las opciones nuevas que
      // no estén ya por nombre en el grupo existente.
      const existing = await tx.productModifierGroup.findFirst({
        where: {
          tenantId,
          productId,
          name: template.name,
          isActive: true,
        },
        include: { options: { where: { isActive: true } } },
      });

      if (existing) {
        if (optionIds && optionIds.length > 0) {
          // Selectivo: agregamos solo las opciones que no existan ya
          const existingNames = new Set(existing.options.map((o) => o.name.toLowerCase()));
          const newOptions = filteredOptions.filter((o) => !existingNames.has(o.name.toLowerCase()));
          if (newOptions.length > 0) {
            await tx.productModifierOption.createMany({
              data: newOptions.map((opt, idx) => ({
                groupId: existing.id,
                tenantId,
                name: opt.name,
                imageUrl: opt.imageUrl,
                priceDelta: opt.priceDelta,
                position: existing.options.length + idx,
                isDefault: opt.isDefault,
                isActive: true,
              })),
            });
          }
          logger.info("variant-catalog.import.merged", {
            tenantId, productId, templateId, groupId: existing.id, added: newOptions.length,
          });
          return {
            groupId: existing.id,
            optionsCount: existing.options.length + newOptions.length,
            alreadyExists: true,
            addedOptions: newOptions.length,
          };
        }
        // Modo todo-el-template y ya existe → idempotente, no duplica
        logger.info("variant-catalog.import.duplicate", {
          tenantId, productId, templateId, existingGroupId: existing.id,
        });
        return {
          groupId: existing.id,
          optionsCount: existing.options.length,
          alreadyExists: true,
        };
      }

      const group = await tx.productModifierGroup.create({
        data: {
          productId,
          tenantId,
          name: template.name,
          description: template.description,
          required: template.required,
          minSelect: template.minSelect,
          maxSelect: template.maxSelect,
          position: template.position,
          isActive: true,
          options: {
            create: filteredOptions.map((opt, idx) => ({
              tenantId,
              name: opt.name,
              imageUrl: opt.imageUrl,
              priceDelta: opt.priceDelta,
              position: opt.position ?? idx,
              isDefault: opt.isDefault,
              isActive: true,
            })),
          },
        },
        include: { options: true },
      });

      logger.info("variant-catalog.import", {
        tenantId,
        productId,
        templateId,
        groupId: group.id,
        optionsCount: group.options.length,
      });

      return { groupId: group.id, optionsCount: group.options.length };
    });
  }

  /** Lista las categorías únicas del catálogo (para el filtro del UI). */
  static async listCategories(): Promise<string[]> {
    const rows = await prisma.variantCatalogTemplate.findMany({
      where: { isPublished: true },
      select: { category: true },
      distinct: ["category"],
      orderBy: { category: "asc" },
    });
    return rows.map((r) => r.category);
  }
}
