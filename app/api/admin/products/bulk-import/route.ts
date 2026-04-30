import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/require-admin";
import { requireActiveSubscription } from "@/lib/billing/require-active-subscription";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * POST /api/admin/products/bulk-import
 *
 * Inserta productos en masa. Recibe un array de objetos planos (idealmente
 * generados client-side desde un CSV/Excel). Valida con Zod, deduplica
 * contra el catálogo del tenant por (name, barcode), inserta en batch.
 *
 * Response shape:
 *   { ok: true, created: N, skipped: N, errors: [{row, message}] }
 *
 * Roles permitidos: admin (dueño/cajero/almacenero del tenant).
 *
 * El frontend debe parsear el CSV con `parse-products.ts` antes de
 * enviarlo — este endpoint NO acepta multipart/form-data, solo JSON
 * (más fácil de validar y de testear con curl).
 */

const RowSchema = z.object({
  name:        z.string().min(1).max(200).trim(),
  category:    z.string().min(1).max(80).trim(),
  price:       z.coerce.number().nonnegative().finite(),
  costPrice:   z.coerce.number().nonnegative().finite().optional().nullable(),
  unit:        z.string().max(40).default("unidad"),
  barcode:     z.string().max(80).optional().nullable(),
  stock:       z.coerce.number().int().min(0).default(0),
  stockMin:    z.coerce.number().int().min(0).optional().nullable(),
  stockMax:    z.coerce.number().int().min(0).optional().nullable(),
  image:       z.string().max(2000).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  badge:       z.string().max(40).optional().nullable(),
  active:      z.coerce.boolean().default(true),
});

const BodySchema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())).min(1).max(2000),
  /** Si true, omite filas duplicadas (mismo name + barcode). Si false, error. */
  skipDuplicates: z.boolean().default(true),
});

const BATCH_SIZE = 50;

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  const blocked = await requireActiveSubscription(auth.tenantId);
  if (blocked) return blocked;
  // Re-check tipos: el guard arriba garantiza auth no es NextResponse
  void auth;
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsedBody = BodySchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsedBody.error.issues },
      { status: 400 },
    );
  }

  const { rows: rawRows, skipDuplicates } = parsedBody.data;
  const tenantId = auth.tenantId;

  // ── Validar fila por fila ──
  const validRows: Array<z.infer<typeof RowSchema>> = [];
  const errors: Array<{ row: number; message: string }> = [];
  rawRows.forEach((r, i) => {
    const parsed = RowSchema.safeParse(r);
    if (parsed.success) {
      validRows.push(parsed.data);
    } else {
      errors.push({
        row: i + 1,
        message: parsed.error.issues.map((iss) => `${iss.path.join(".")}: ${iss.message}`).join("; "),
      });
    }
  });

  if (validRows.length === 0) {
    return NextResponse.json(
      { ok: false, created: 0, skipped: 0, errors, message: "Ninguna fila válida" },
      { status: 422 },
    );
  }

  // ── Deduplicar contra DB existente ──
  let skipped = 0;
  const existingNames = new Set<string>();
  const existingBarcodes = new Set<string>();
  try {
    const existing = await prisma.product.findMany({
      where: { tenantId, deletedAt: null },
      select: { name: true, barcode: true },
    });
    existing.forEach((e) => {
      if (e.name) existingNames.add(e.name.trim().toLowerCase());
      if (e.barcode) existingBarcodes.add(e.barcode.trim());
    });
  } catch (err) {
    logger.error("[bulk-import] dedup query failed", { error: String(err) });
    return NextResponse.json({ error: "No se pudo validar duplicados" }, { status: 500 });
  }

  const uniqueRows = validRows.filter((r) => {
    const isDup =
      existingNames.has(r.name.trim().toLowerCase()) ||
      (r.barcode ? existingBarcodes.has(r.barcode.trim()) : false);
    if (isDup) {
      if (!skipDuplicates) {
        errors.push({ row: 0, message: `Duplicado: ${r.name}` });
      }
      skipped++;
      return false;
    }
    // Mark as seen to also dedupe within the batch itself
    existingNames.add(r.name.trim().toLowerCase());
    if (r.barcode) existingBarcodes.add(r.barcode.trim());
    return true;
  });

  if (!skipDuplicates && uniqueRows.length < validRows.length) {
    return NextResponse.json(
      { ok: false, created: 0, skipped, errors, message: "Hay duplicados — pasá skipDuplicates=true para omitirlos" },
      { status: 409 },
    );
  }

  // ── Insertar en batches ──
  let created = 0;
  for (let i = 0; i < uniqueRows.length; i += BATCH_SIZE) {
    const slice = uniqueRows.slice(i, i + BATCH_SIZE);
    try {
      const result = await prisma.product.createMany({
        data: slice.map((r) => ({
          tenantId,
          name:        r.name,
          category:    r.category,
          price:       r.price,
          costPrice:   r.costPrice ?? null,
          unit:        r.unit,
          barcode:     r.barcode ?? null,
          stock:       r.stock,
          stockMin:    r.stockMin ?? null,
          stockMax:    r.stockMax ?? null,
          image:       r.image ?? "",
          description: r.description ?? null,
          badge:       r.badge ?? null,
          active:      r.active,
        })),
        skipDuplicates: true,
      });
      created += result.count;
    } catch (err) {
      logger.error("[bulk-import] batch insert failed", { batch: i / BATCH_SIZE, error: String(err) });
      errors.push({ row: i + 1, message: `Error al insertar batch ${i / BATCH_SIZE + 1}: ${(err as Error).message}` });
    }
  }

  logger.info("[bulk-import] done", { tenantId, created, skipped, errors: errors.length });

  return NextResponse.json({
    ok: errors.length === 0,
    created,
    skipped,
    errors: errors.slice(0, 50), // cap at 50 to avoid huge responses
    message:
      created > 0
        ? `${created} productos creados. ${skipped} duplicados omitidos.`
        : "No se creó ningún producto",
  });
}
