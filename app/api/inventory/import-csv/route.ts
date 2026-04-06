export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const CsvRowSchema = z.object({
  barcode: z.string().min(1).max(50),
  nombre: z.string().min(1).max(200),
  precio: z.number().min(0),
  stock: z.number().int().min(0),
  costo: z.number().min(0).optional(),
});

const ImportSchema = z.object({
  rows: z.array(CsvRowSchema).min(1).max(5000),
});

// POST /api/inventory/import-csv — bulk import/update products from parsed CSV
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

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
    ).catch(() => {});

    return NextResponse.json({ success, errors });
  } catch (e) {
    logger.error("[inventory/import-csv] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
