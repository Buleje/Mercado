export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { z } from "zod";
import { applyRateLimit } from "@/lib/rate-limit";
import { BatchesDB } from "@/lib/db";

// ── Schemas ───────────────────────────────────────────────────────────────────

const CreateSchema = z.object({
  lote: z.string().min(1).max(100),
  productName: z.string().min(1).max(200),
  productId: z.number().int().positive().optional(),
  productCategory: z.string().default("Otros"),
  quantity: z.number().positive(),
  unit: z.string().default("unidad"),
  supplierId: z.string().optional(),
  supplierName: z.string().default(""),
  warehouseId: z.string().optional(),
  entryDate: z.string().datetime(),
  expiryDate: z.string().datetime(),
  costUnit: z.number().min(0).default(0),
  notes: z.string().max(1000).default(""),
});

const UpdateSchema = CreateSchema.partial();

const GetSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  search: z.string().optional(),
  productId: z.coerce.number().int().positive().optional(),
  warehouseId: z.string().optional(),
  status: z.enum(["active", "expired", "expiring", "empty"]).optional(),
  expiringDays: z.coerce.number().int().min(1).max(365).optional(),
});

// ── GET /api/batches ──────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const parsed = GetSchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Parámetros inválidos", issues: parsed.error.issues }, { status: 400 });
  }

  const result = await BatchesDB.getAll(auth.tenantId, parsed.data);
  return NextResponse.json(result);
}

// ── POST /api/batches ─────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const rl = applyRateLimit(req, "MODERATE", "batches");
  if (rl) return rl;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body inválido" }, { status: 400 });

  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
  }

  const batch = await BatchesDB.create(auth.tenantId, parsed.data);
  return NextResponse.json(batch, { status: 201 });
}

// ── PATCH /api/batches?id=xxx ─────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Parámetro id requerido" }, { status: 400 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body inválido" }, { status: 400 });

  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
  }

  const batch = await BatchesDB.update(auth.tenantId, id, parsed.data);
  if (!batch) return NextResponse.json({ error: "Lote no encontrado" }, { status: 404 });

  return NextResponse.json(batch);
}

// ── DELETE /api/batches?id=xxx ────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const rl = applyRateLimit(req, "MODERATE", "batches");
  if (rl) return rl;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Parámetro id requerido" }, { status: 400 });

  const deleted = await BatchesDB.delete(auth.tenantId, id);
  if (!deleted) return NextResponse.json({ error: "Lote no encontrado" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
