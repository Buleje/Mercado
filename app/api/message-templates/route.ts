import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { z } from "zod";
import { applyRateLimit } from "@/lib/rate-limit";
import { MessageTemplatesDB } from "@/lib/db/message-templates.db";
import { runWithAuditContext } from "@/lib/audit/audit-context";

const ChannelEnum = z.enum(["whatsapp", "email", "sms"]);
const CategoryEnum = z.enum(["ventas", "cobranza", "delivery", "promociones", "atención", "general"]);

const CreateSchema = z.object({
  name: z.string().min(1).max(200),
  channel: ChannelEnum,
  category: CategoryEnum,
  subject: z.string().max(300).optional(),
  body: z.string().min(1).max(5000),
  variablesJson: z.string().default("[]"),
  starred: z.boolean().default(false),
});

const UpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  channel: ChannelEnum.optional(),
  category: CategoryEnum.optional(),
  subject: z.string().max(300).nullable().optional(),
  body: z.string().min(1).max(5000).optional(),
  variablesJson: z.string().optional(),
  starred: z.boolean().optional(),
  usageCount: z.number().int().min(0).optional(),
});

// GET /api/message-templates
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const rows = await MessageTemplatesDB.list(auth.tenantId);

  return NextResponse.json(rows.map(r => ({
    ...r,
    variables: JSON.parse(r.variablesJson),
    subject: r.subject ?? undefined,
  })));
}

// POST /api/message-templates
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  const rl = applyRateLimit(req, "MODERATE", "templates");
  if (rl) return rl;

  return runWithAuditContext(req, auth.username, async () => {
    const body = await req.json();
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const row = await MessageTemplatesDB.create(auth.tenantId, {
      ...parsed.data,
      subject: parsed.data.subject ?? null,
    });
    return NextResponse.json({ ...row, variables: JSON.parse(row.variablesJson) }, { status: 201 });
  });
}

// PATCH /api/message-templates?id=xxx
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  return runWithAuditContext(req, auth.username, async () => {
    const body = await req.json();
    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    // updateMany atómico con tenantId (previene TOCTOU — HOTFIX-M3 2026-04-29)
    const row = await MessageTemplatesDB.update(auth.tenantId, id, parsed.data);
    if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });

    return NextResponse.json({ ...row, variables: JSON.parse(row.variablesJson) });
  });
}

// DELETE /api/message-templates?id=xxx
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  const rl = applyRateLimit(req, "MODERATE", "templates");
  if (rl) return rl;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  return runWithAuditContext(req, auth.username, async () => {
    const deleted = await MessageTemplatesDB.delete(auth.tenantId, id);
    if (!deleted) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  });
}
