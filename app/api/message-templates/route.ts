import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { applyRateLimit } from "@/lib/rate-limit";

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

  const rows = await prisma.messageTemplate.findMany({
    where: { tenantId: auth.tenantId },
    orderBy: [{ starred: "desc" }, { usageCount: "desc" }, { createdAt: "desc" }],
  });

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

  const body = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const row = await prisma.messageTemplate.create({
    data: { ...parsed.data, tenantId: auth.tenantId },
  });

  return NextResponse.json({ ...row, variables: JSON.parse(row.variablesJson) }, { status: 201 });
}

// PATCH /api/message-templates?id=xxx
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const body = await req.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // SECURITY (HOTFIX-M3, 2026-04-29): updateMany atomico con tenantId
  // (antes findFirst + update tenia ventana TOCTOU).
  const result = await prisma.messageTemplate.updateMany({
    where: { id, tenantId: auth.tenantId },
    data: parsed.data,
  });
  if (result.count === 0) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const row = await prisma.messageTemplate.findFirst({
    where: { id, tenantId: auth.tenantId },
  });
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({ ...row, variables: JSON.parse(row.variablesJson) });
}

// DELETE /api/message-templates?id=xxx
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  const rl = applyRateLimit(req, "MODERATE", "templates");
  if (rl) return rl;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // SECURITY (HOTFIX-M3): deleteMany atomico con tenantId.
  const result = await prisma.messageTemplate.deleteMany({
    where: { id, tenantId: auth.tenantId },
  });
  if (result.count === 0) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
