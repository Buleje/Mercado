import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { SavedFiltersDB } from "@/lib/db/saved-filters.db";
import { z } from "zod";
import { applyRateLimit } from "@/lib/rate-limit";
import { runWithAuditContext } from "@/lib/audit/audit-context";
import { assertCsrf } from "@/lib/auth/csrf";

const ConditionSchema = z.object({
  field: z.string(),
  operator: z.string(),
  value: z.string(),
});

const CreateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).default(""),
  module: z.string().min(1),
  conditionsJson: z.string().default("[]"),
  isDefault: z.boolean().default(false),
});

const UpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  module: z.string().min(1).optional(),
  conditionsJson: z.string().optional(),
  isDefault: z.boolean().optional(),
  usageCount: z.number().int().min(0).optional(),
});

function mapFilter(f: {
  id: string; name: string; description: string; module: string;
  conditionsJson: string; isDefault: boolean; usageCount: number; createdAt: Date;
}) {
  let conditions = [];
  try { conditions = JSON.parse(f.conditionsJson); } catch { /* ignore */ }
  return {
    id: f.id,
    name: f.name,
    description: f.description,
    module: f.module,
    conditions,
    isDefault: f.isDefault,
    usageCount: f.usageCount,
    createdAt: f.createdAt.toISOString().slice(0, 10),
  };
}

// GET /api/saved-filters
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const rows = await SavedFiltersDB.list(auth.tenantId);
  return NextResponse.json(rows.map(mapFilter));
}

// POST /api/saved-filters
export async function POST(req: NextRequest) {
  const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req, ["admin", "cajero", "almacenero"]);
  if (auth instanceof NextResponse) return auth;
  const rl = applyRateLimit(req, "MODERATE", "saved-filters");
  if (rl) return rl;

  return runWithAuditContext(req, auth.username, async () => {
    const body = await req.json();
    // Accept either conditionsJson string or conditions array
    if (Array.isArray(body.conditions) && !body.conditionsJson) {
      const result = z.array(ConditionSchema).safeParse(body.conditions);
      body.conditionsJson = result.success ? JSON.stringify(result.data) : "[]";
    }

    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const row = await SavedFiltersDB.create(auth.tenantId, parsed.data);
    return NextResponse.json(mapFilter(row), { status: 201 });
  });
}

// PATCH /api/saved-filters?id=xxx
export async function PATCH(req: NextRequest) {
  const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req, ["admin", "cajero", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  return runWithAuditContext(req, auth.username, async () => {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const body = await req.json();
    if (Array.isArray(body.conditions) && !body.conditionsJson) {
      const result = z.array(ConditionSchema).safeParse(body.conditions);
      body.conditionsJson = result.success ? JSON.stringify(result.data) : "[]";
    }

    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const row = await SavedFiltersDB.updateForTenant(auth.tenantId, id, parsed.data);
    if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });

    return NextResponse.json(mapFilter(row));
  });
}

// DELETE /api/saved-filters?id=xxx
export async function DELETE(req: NextRequest) {
  const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req, ["admin", "cajero", "almacenero"]);
  if (auth instanceof NextResponse) return auth;
  const rl = applyRateLimit(req, "MODERATE", "saved-filters");
  if (rl) return rl;

  return runWithAuditContext(req, auth.username, async () => {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const ok = await SavedFiltersDB.deleteForTenant(auth.tenantId, id);
    if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });

    return NextResponse.json({ ok: true });
  });
}
