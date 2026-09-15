import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";
import { requireActiveSubscription } from "@/lib/billing/require-active-subscription";
import { revalidateTenantTag } from "@/lib/cache";

const CsvRowSchema = z.object({
  barcode: z.string().min(1).max(50),
  nombre: z.string().min(1).max(200),
  precio: z.number().min(0),
  stock: z.number().int().min(0),
  costo: z.number().min(0).optional(),
});

// F3: reducir límite de iteración 5000 → 500
const ImportSchema = z.object({
  rows: z.array(CsvRowSchema).min(1).max(500),
});

// POST /api/inventory/import-csv — bulk import/update products from parsed CSV
export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "inventory-import-csv"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;
  const blocked = await requireActiveSubscription(auth.tenantId);
  if (blocked) return blocked;

  try {
    const raw = await req.json();
    const parsed = ImportSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) },
        { status: 400 },
      );
    }

    let success = 0;
    const errors: { row: number; field: string; message: string }[] = [];

    for (let i = 0; i < parsed.data.rows.length; i++) {
      const row = parsed.data.rows[i];
      try {
        // Look up product by barcode
        const existing = await prisma.product.findFirst({
          where: { barcode: row.barcode, tenantId: auth.tenantId },
        });

        if (existing) {
          // Update existing product
          await prisma.product.update({
            where: { id: existing.id },
            data: {
              price: row.precio,
              stock: row.stock,
              ...(row.costo !== undefined && { costPrice: row.costo }),
            },
          });
        } else {
          // Create new product
          await prisma.product.create({
            data: {
              name: row.nombre,
              category: "General",
              barcode: row.barcode,
              price: row.precio,
              stock: row.stock,
              costPrice: row.costo ?? row.precio * 0.7,
              tenantId: auth.tenantId,
            },
          });
        }
        success++;
      } catch (e) {
        errors.push({
          row: i + 1,
          field: "barcode",
          message: e instanceof Error ? e.message : "Error desconocido",
        });
      }
    }

    logActivity(
      "Importar", "inventario",
      `Importación CSV: ${success} exitosos, ${errors.length} errores de ${parsed.data.rows.length} filas`,
      undefined, auth.username,
    ).catch((err) => logger.warn("[inventory/import-csv] activity log failed", { err: String(err) }));

    /**
     * Los precios y el stock se escriben con `prisma` directo, salteando
     * `ProductsDB` — que es quien normalmente invalida. Sin esto, la tienda y
     * el POS siguen sirviendo el catálogo cacheado: se importa la lista nueva
     * del proveedor, se ve «120 productos actualizados», y el mostrador sigue
     * cobrando los precios de antes hasta que venza el cache.
     */
    if (success > 0) {
      revalidateTenantTag(auth.tenantId, "products");
    }

    return NextResponse.json({ success, errors });
  } catch (e) {
    logger.error("[inventory/import-csv] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
