import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import ExcelJS from "exceljs";
import { requireAdmin } from "@/lib/require-admin";
import { ProductsDB } from "@/lib/db/products.db";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

// ── Schemas ───────────────────────────────────────────────────────────────────

const RowSchema = z.object({
  nombre: z.string().min(1, "Nombre vacío").max(150),
  categoria: z.string().max(100).default("General"),
  precio: z.number({ error: "Precio inválido" }).positive("Precio debe ser mayor a 0"),
  precio_costo: z.number().min(0).optional(),
  stock: z.number().int().min(0).default(0),
  stock_minimo: z.number().int().min(0).optional(),
  unidad: z.string().max(20).default("unidad"),
  codigo_barras: z.string().max(100).optional(),
});

type RowInput = z.infer<typeof RowSchema>;

// ── Column aliases ─────────────────────────────────────────────────────────────
// Normaliza variantes comunes de nombres de columna al nombre canónico esperado.

const COLUMN_ALIASES: Record<string, string> = {
  // nombre
  name: "nombre",
  producto: "nombre",
  "nombre del producto": "nombre",
  // categoria
  category: "categoria",
  tipo: "categoria",
  grupo: "categoria",
  // precio
  price: "precio",
  valor: "precio",
  "precio venta": "precio",
  "precio de venta": "precio",
  // precio_costo
  costo: "precio_costo",
  "precio costo": "precio_costo",
  "costo unitario": "precio_costo",
  cost: "precio_costo",
  // stock
  cantidad: "stock",
  existencia: "stock",
  qty: "stock",
  // stock_minimo
  "stock min": "stock_minimo",
  "stock minimo": "stock_minimo",
  "minimo": "stock_minimo",
  // unidad
  unit: "unidad",
  um: "unidad",
  medida: "unidad",
  // codigo_barras
  barcode: "codigo_barras",
  ean: "codigo_barras",
  "codigo": "codigo_barras",
  "cod barras": "codigo_barras",
};

function normalizeKey(raw: string): string {
  const lower = raw.trim().toLowerCase();
  return COLUMN_ALIASES[lower] ?? lower.replace(/\s+/g, "_");
}

function normalizeRow(rawRow: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rawRow)) {
    out[normalizeKey(k)] = v;
  }
  return out;
}

function toNumber(val: unknown): number | undefined {
  if (val === null || val === undefined || val === "") return undefined;
  const n = Number(String(val).replace(",", "."));
  return isNaN(n) ? undefined : n;
}

/**
 * Lee un workbook de exceljs y devuelve filas como objetos {header: value}.
 * Toma la primera hoja, asume que la primera fila son headers.
 */
function workbookToJson(workbook: ExcelJS.Workbook): Record<string, unknown>[] {
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const rows: Record<string, unknown>[] = [];
  let headers: string[] = [];

  sheet.eachRow({ includeEmpty: false }, (row: ExcelJS.Row, rowNumber: number) => {
    const values = row.values as unknown[];
    // exceljs values[] es 1-indexed; index 0 es siempre undefined
    const cells = values.slice(1).map((v) => {
      if (v === null || v === undefined) return "";
      // Si es objeto rich-text de exceljs, sacar el texto plano
      if (typeof v === "object" && "richText" in (v as object)) {
        const rt = (v as { richText: { text: string }[] }).richText;
        return rt.map((r) => r.text).join("");
      }
      // Si es objeto formula, usar el resultado
      if (typeof v === "object" && "result" in (v as object)) {
        return (v as { result: unknown }).result ?? "";
      }
      return v;
    });

    if (rowNumber === 1) {
      headers = cells.map((c) => String(c ?? ""));
    } else {
      const obj: Record<string, unknown> = {};
      for (let i = 0; i < headers.length; i++) {
        obj[headers[i]] = cells[i] ?? "";
      }
      rows.push(obj);
    }
  });

  return rows;
}

// ── Handler ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "products-import"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const requestId = req.headers.get("x-request-id") ?? undefined;

  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || typeof file === "string") {
      logger.warn("[products/import] Sin archivo en FormData", { requestId, user: auth.username });
      return NextResponse.json({ error: "No se recibió archivo" }, { status: 400 });
    }

    logger.info("[products/import] Iniciando lectura de archivo", {
      requestId,
      user: auth.username,
      fileName: (file as File).name,
      size: (file as File).size,
    });

    const arrayBuffer = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    // exceljs internamente acepta cualquier dato binario (Buffer, ArrayBuffer,
    // Uint8Array) via toBuffer(), pero sus @types exportan la firma vieja
    // `load(buffer: Buffer)` que choca con el `Buffer<ArrayBufferLike>` del
    // @types/node reciente. Cast pragmático para evitar el mismatch estructural.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await workbook.xlsx.load(Buffer.from(arrayBuffer) as any);

    if (workbook.worksheets.length === 0) {
      return NextResponse.json({ error: "El archivo no contiene hojas" }, { status: 400 });
    }

    const rawRows = workbookToJson(workbook);

    if (rawRows.length === 0) {
      logger.warn("[products/import] Archivo vacío", { requestId, user: auth.username });
      return NextResponse.json({ error: "El archivo está vacío" }, { status: 400 });
    }

    if (rawRows.length > 1000) {
      logger.warn("[products/import] Límite de filas excedido", { requestId, rows: rawRows.length });
      return NextResponse.json(
        { error: `Máximo 1000 filas por importación. El archivo tiene ${rawRows.length}.` },
        { status: 400 }
      );
    }

    logger.info("[products/import] Procesando filas", { requestId, rows: rawRows.length });

    // Obtener el ID más alto actual para asignar IDs secuenciales
    const existingProducts = await ProductsDB.getAll(auth.tenantId);
    let nextId = existingProducts.length > 0
      ? Math.max(...existingProducts.map((p) => p.id)) + 1
      : 1;

    const errors: { row: number; message: string }[] = [];
    let created = 0;

    for (let i = 0; i < rawRows.length; i++) {
      const rowNum = i + 2; // +2 porque fila 1 son headers, filas empiezan en 2
      const normalized = normalizeRow(rawRows[i]);

      // Coercionar tipos numéricos antes de validar
      const coerced: Partial<RowInput & Record<string, unknown>> = {
        nombre: String(normalized.nombre ?? "").trim(),
        categoria: String(normalized.categoria ?? "").trim() || "General",
        precio: toNumber(normalized.precio),
        precio_costo: toNumber(normalized.precio_costo),
        stock: toNumber(normalized.stock) ?? 0,
        stock_minimo: toNumber(normalized.stock_minimo),
        unidad: String(normalized.unidad ?? "").trim() || "unidad",
        codigo_barras: String(normalized.codigo_barras ?? "").trim() || undefined,
      };

      const parsed = RowSchema.safeParse(coerced);

      if (!parsed.success) {
        const msgs = parsed.error.issues.map((iss) => `${iss.path.join(".")}: ${iss.message}`).join("; ");
        errors.push({ row: rowNum, message: msgs });
        continue;
      }

      const data = parsed.data;

      try {
        await ProductsDB.upsert({
          id: nextId++,
          name: data.nombre,
          category: data.categoria,
          price: data.precio,
          costPrice: data.precio_costo,
          image: "",
          unit: data.unidad,
          stock: data.stock,
          stockMin: data.stock_minimo,
          barcode: data.codigo_barras,
          active: true,
          tenantId: auth.tenantId,
        });
        created++;
      } catch (dbErr) {
        logger.error("[products/import] Error guardando fila", {
          requestId,
          row: rowNum,
          err: dbErr instanceof Error ? dbErr.message : String(dbErr),
        });
        errors.push({ row: rowNum, message: "Error al guardar en base de datos" });
      }
    }

    logger.info("[products/import] Importación completada", {
      requestId,
      user: auth.username,
      created,
      errors: errors.length,
    });

    logActivity(
      "Importar",
      "producto",
      `Importación Excel: ${created} creados, ${errors.length} errores`,
      undefined,
      auth.username ?? "admin"
    ).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });

    return NextResponse.json({ created, errors }, { status: 201 });
  } catch (err) {
    logger.error("[products/import] Error inesperado", {
      requestId,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Error procesando el archivo" }, { status: 503 });
  }
}

// ── Plantilla de descarga ──────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const template = [
    {
      nombre: "Arroz Extra 5kg",
      categoria: "abarrotes",
      precio: 18.5,
      precio_costo: 14.0,
      stock: 50,
      stock_minimo: 10,
      unidad: "bolsa",
      codigo_barras: "7751234560011",
    },
    {
      nombre: "Aceite Vegetal 1L",
      categoria: "abarrotes",
      precio: 7.9,
      precio_costo: 5.5,
      stock: 30,
      stock_minimo: 5,
      unidad: "botella",
      codigo_barras: "",
    },
  ];

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Buleje ERP";
  workbook.created = new Date();
  const worksheet = workbook.addWorksheet("Productos");

  worksheet.columns = [
    { header: "nombre", key: "nombre", width: 30 },
    { header: "categoria", key: "categoria", width: 15 },
    { header: "precio", key: "precio", width: 10 },
    { header: "precio_costo", key: "precio_costo", width: 12 },
    { header: "stock", key: "stock", width: 8 },
    { header: "stock_minimo", key: "stock_minimo", width: 12 },
    { header: "unidad", key: "unidad", width: 10 },
    { header: "codigo_barras", key: "codigo_barras", width: 18 },
  ];

  // Estilizar header
  worksheet.getRow(1).font = { bold: true };

  for (const row of template) {
    worksheet.addRow(row);
  }

  const buf = await workbook.xlsx.writeBuffer();

  return new Response(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="plantilla-productos.xlsx"',
    },
  });
}
