import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { WarehousesDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";
import { logActivity } from "@/lib/activity-logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";

const CreateSchema = z.object({
  name: z.string().min(1).max(80),
  code: z.string().min(1).max(20),
  type: z.enum(["principal", "secundario", "punto-venta", "deposito", "frigorifico"]).optional(),
  location: z.string().max(200).optional(),
  manager: z.string().max(80).optional(),
  capacity: z.number().int().positive().optional(),
});

const UpdateSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  location: z.string().max(200).optional(),
  manager: z.string().max(80).optional(),
  capacity: z.number().int().positive().optional(),
  active: z.boolean().optional(),
});

/** GET /api/admin/warehouses — list all warehouses (auto-creates default if empty) */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const warehouses = await WarehousesDB.ensureDefault(auth.tenantId);
  return NextResponse.json(warehouses);
}

/** POST /api/admin/warehouses — create a new warehouse */
export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "admin-warehouses"); if (_rl) return _rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const raw = await req.json();
  const parsed = CreateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues.map(i => i.message) },
      { status: 400 },
    );
  }

  const warehouse = await WarehousesDB.create({ ...parsed.data, tenantId: auth.tenantId });
  logActivity("create", "warehouse", `Almacén creado: ${warehouse.name} (${warehouse.code})`, warehouse.id, "admin");
  return NextResponse.json(warehouse, { status: 201 });
}

/** PATCH /api/admin/warehouses — update a warehouse (pass id in body) */
export async function PATCH(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "admin-warehouses"); if (_rl) return _rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const raw = await req.json();
  const { id, ...rest } = raw as { id?: string } & Record<string, unknown>;
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "id requerido" }, { status: 400 });
  }

  const parsed = UpdateSchema.safeParse(rest);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues.map(i => i.message) },
      { status: 400 },
    );
  }

  const updated = await WarehousesDB.update(auth.tenantId, id, parsed.data);
  if (!updated) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json(updated);
}

/** DELETE /api/admin/warehouses?id=xxx — delete a warehouse */
export async function DELETE(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "admin-warehouses"); if (_rl) return _rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  // Safety: cannot delete the last remaining warehouse
  const all = await WarehousesDB.getAll(auth.tenantId);
  if (all.length <= 1) {
    return NextResponse.json(
      { error: "No se puede eliminar el único almacén activo" },
      { status: 409 },
    );
  }

  // Safety: cannot delete the principal warehouse
  const target = all.find(w => w.id === id);
  if (!target) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  if (target.type === "principal") {
    return NextResponse.json(
      { error: "No se puede eliminar el almacén principal. Cambia su tipo antes de eliminar." },
      { status: 409 },
    );
  }

  const deleted = await WarehousesDB.delete(auth.tenantId, id);
  if (!deleted) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  logActivity("delete", "warehouse", `Almacén eliminado: ${target.name} (${target.code})`, id, "admin");
  return NextResponse.json({ success: true });
}
