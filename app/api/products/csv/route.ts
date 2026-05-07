import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-logger";
import { invalidate } from "@/lib/cache";
import { applyRateLimit } from "@/lib/rate-limit";

// GET /api/products/csv — Export products as CSV download
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const products = await prisma.product.findMany({
    where: { tenantId: auth.tenantId, deletedAt: null },
    orderBy: { id: "asc" },
  });

  const headers = ["id", "name", "category", "price", "costPrice", "unit", "stock", "stockMin", "stockMax", "badge", "barcode", "active", "description"];
  const csvRows = [headers.join(",")];

  for (const p of products) {
    const row = headers.map((h) => {
      const val = (p as Record<string, unknown>)[h];
      if (val == null) return "";
      const str = String(val);
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    });
    csvRows.push(row.join(","));
  }

  return new NextResponse(csvRows.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="productos_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}

// POST /api/products/csv — Import products from CSV file
export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "products-csv"); if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const formData = await req.formData();
  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Archivo CSV requerido" }, { status: 400 });
  }

  const text = await file.text();
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) {
    return NextResponse.json({ error: "El CSV debe tener al menos una fila de datos" }, { status: 400 });
  }

  const csvHeaders = parseCSVLine(lines[0]);
  const requiredHeaders = ["name", "category", "price"];
  for (const h of requiredHeaders) {
    if (!csvHeaders.includes(h)) {
      return NextResponse.json({ error: `Columna requerida faltante: ${h}` }, { status: 400 });
    }
  }

  let created = 0;
  let updated = 0;
  let errors = 0;
  const errorDetails: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row: Record<string, string> = {};
    csvHeaders.forEach((h, idx) => { row[h] = values[idx] ?? ""; });

    try {
      const name = row.name?.trim();
      const category = row.category?.trim();
      const price = parseFloat(row.price);

      if (!name || !category || isNaN(price)) {
        errors++;
        errorDetails.push(`Fila ${i + 1}: nombre, categoría o precio inválido`);
        continue;
      }

      const data = {
        name,
        category,
        price,
        costPrice: row.costPrice ? parseFloat(row.costPrice) || null : null,
        unit: row.unit?.trim() || "unidad",
        stock: row.stock ? parseInt(row.stock) : null,
        stockMin: row.stockMin ? parseInt(row.stockMin) : null,
        stockMax: row.stockMax ? parseInt(row.stockMax) : null,
        badge: row.badge?.trim() || null,
        barcode: row.barcode?.trim() || null,
        active: row.active ? row.active.toLowerCase() === "true" : true,
        description: row.description?.trim() || null,
        tenantId: auth.tenantId,
      };

      const existingId = row.id ? parseInt(row.id) : null;
      if (existingId && !isNaN(existingId)) {
        await prisma.product.update({ where: { id: existingId }, data });
        updated++;
      } else {
        await prisma.product.create({ data });
        created++;
      }
    } catch {
      errors++;
      errorDetails.push(`Fila ${i + 1}: error al guardar`);
    }
  }

  logActivity(
    "Import", "producto",
    `CSV importado: ${created} nuevos, ${updated} actualizados, ${errors} errores`,
    undefined, "admin",
  ).catch(() => {});
  invalidate(`dashboard:${auth.tenantId}`);

  return NextResponse.json({
    created,
    updated,
    errors,
    errorDetails: errorDetails.slice(0, 20),
    total: lines.length - 1,
  });
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        result.push(current);
        current = "";
      } else {
        current += char;
      }
    }
  }
  result.push(current);
  return result;
}
