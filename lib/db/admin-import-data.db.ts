/**
 * lib/db/admin-import-data.db.ts
 *
 * DB class para importacion masiva de productos y clientes via panel admin.
 * Audit project-wide 2026-05-19: extrae prisma.* directo de
 * app/api/admin/import-data/route.ts.
 *
 * tenantId es SIEMPRE el primer argumento (regla #3 CLAUDE.md).
 */
import "server-only";
import { prisma } from "@/lib/prisma";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ProductImportRow = {
  name: string;
  category: string;
  price: number;
  costPrice: number | null;
  unit: string;
  stock: number | null;
  stockMin: number | null;
  active: boolean;
  barcode: string | null;
  description: string | null;
};

export type CustomerImportRow = {
  phone: string;
  name: string;
  location: string;
};

export type ImportResult = {
  products: number;
  customers: number;
};

// ── AdminImportDataDB ─────────────────────────────────────────────────────────

export const AdminImportDataDB = {
  /**
   * Importa productos en bulk usando createMany con skipDuplicates.
   * Retorna la cantidad de filas insertadas efectivamente.
   */
  async importProducts(
    tenantId: string,
    rows: ProductImportRow[],
  ): Promise<number> {
    if (rows.length === 0) return 0;
    const result = await prisma.product.createMany({
      data: rows.map((r) => ({ ...r, tenantId })),
      skipDuplicates: true,
    });
    return result.count;
  },

  /**
   * Importa clientes en bulk usando createMany con skipDuplicates.
   * Retorna la cantidad de filas insertadas efectivamente.
   */
  async importCustomers(
    tenantId: string,
    rows: CustomerImportRow[],
  ): Promise<number> {
    if (rows.length === 0) return 0;
    const result = await prisma.customer.createMany({
      data: rows.map((r) => ({ ...r, tenantId })),
      skipDuplicates: true,
    });
    return result.count;
  },
};
