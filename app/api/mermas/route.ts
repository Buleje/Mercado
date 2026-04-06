export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { z } from "zod";
import { applyRateLimit } from "@/lib/rate-limit";
import { MermasDB } from "@/lib/db";

// ── Schemas ───────────────────────────────────────────────────────────────────

const LossTypeEnum = z.enum(["damages", "theft", "expiry", "obsolescence"]);

const CreateSchema = z.object({
  productId: z.number().int().positive(),
  quantity: z.number().int().positive(),
  lossType: LossTypeEnum,
  batchId: z.string().optional(),
  notes: z.string().max(1000).optional(),
  warehouseId: z.string().optional(),
  registeredBy: z.string().max(100).optional(),
});

const GetSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  productId: z.coerce.number().int().positive().optional(),
  lossType: LossTypeEnum.optional(),
  warehouseId: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

// ── GET /api/mermas ───────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const parsed = GetSchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Parámetros inválidos", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  try {
    const result = await MermasDB.getAll(auth.tenantId, parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── POST /api/mermas ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const rl = applyRateLimit(req, "MODERATE", "mermas");
  if (rl) return rl;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body inválido" }, { status: 400 });

  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  try {
    const merma = await MermasDB.create(auth.tenantId, parsed.data);
    return NextResponse.json(merma, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
