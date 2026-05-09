import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { toErrorPayload } from "@/lib/api-error";
import { applyRateLimit } from "@/lib/rate-limit";
import { LocationsDB } from "@/lib/db/locations.db";
import { runWithAuditContext } from "@/lib/audit/audit-context";

const CreateSchema = z.object({
  code: z.string().min(1).max(30),
  zone: z.string().min(1).max(80),
  aisle: z.string().max(30).optional(),
  shelf: z.string().max(30).optional(),
  bin: z.string().max(30).optional(),
  warehouseId: z.string().min(1),
  productId: z.number().positive().optional().nullable(),
  qty: z.number().int().min(0).optional(),
  capacity: z.number().int().min(0),
  category: z.string().max(80).optional(),
});

const UpdateSchema = CreateSchema.partial().extend({
  id: z.string().min(1),
});

function mapLocation(row: {
  id: string;
  code: string;
  zone: string;
  aisle: string;
  shelf: string;
  bin: string;
  warehouseId: string;
  productId: number | null;
  qty: number;
  capacity: number;
  category: string;
  warehouse: { name: string };
  product: { name: string; category: string } | null;
}) {
  return {
    id: row.id,
    code: row.code,
    zone: row.zone,
    aisle: row.aisle,
    shelf: row.shelf,
    bin: row.bin,
    warehouseId: row.warehouseId,
    warehouseName: row.warehouse.name,
    productId: row.productId,
    product: row.product?.name ?? null,
    qty: row.qty,
    capacity: row.capacity,
    category: row.category || row.product?.category || "",
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const rows = await LocationsDB.list(auth.tenantId);
    return NextResponse.json(rows.map((row) => mapLocation(row)));
  } catch (err) {
    const { payload, status } = toErrorPayload(err);
    return NextResponse.json(payload, { status });
  }
}

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "locations"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  return runWithAuditContext(req, auth.username, async () => {
    try {
      const raw = await req.json();
      const parsed = CreateSchema.safeParse(raw);
      if (!parsed.success) {
        return NextResponse.json({ error: "Datos invalidos", issues: parsed.error.issues.map((issue) => issue.message) }, { status: 400 });
      }

      const row = await LocationsDB.create(auth.tenantId, parsed.data);
      return NextResponse.json(mapLocation(row), { status: 201 });
    } catch (err) {
      const { payload, status } = toErrorPayload(err);
      return NextResponse.json(payload, { status });
    }
  });
}

export async function PATCH(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "locations"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  return runWithAuditContext(req, auth.username, async () => {
    try {
      const raw = await req.json();
      const parsed = UpdateSchema.safeParse(raw);
      if (!parsed.success) {
        return NextResponse.json({ error: "Datos invalidos", issues: parsed.error.issues.map((issue) => issue.message) }, { status: 400 });
      }

      const { id, ...rest } = parsed.data;
      // Round 21 P0 (Security): updateMany con tenantId rechaza cross-tenant writes
      const row = await LocationsDB.update(auth.tenantId, id, rest);
      if (!row) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json(mapLocation(row));
    } catch (err) {
      const { payload, status } = toErrorPayload(err);
      return NextResponse.json(payload, { status });
    }
  });
}

export async function DELETE(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "locations"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  return runWithAuditContext(req, auth.username, async () => {
    try {
      const id = new URL(req.url).searchParams.get("id");
      if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

      // Round 21 P0 (Security): tenantId guard previene cross-tenant delete
      const deleted = await LocationsDB.delete(auth.tenantId, id);
      if (!deleted) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json({ ok: true });
    } catch (err) {
      const { payload, status } = toErrorPayload(err);
      return NextResponse.json(payload, { status });
    }
  });
}
