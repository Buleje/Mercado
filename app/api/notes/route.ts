import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";

const CreateSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().max(5000).default(""),
  color: z.enum(["yellow", "green", "blue", "pink", "purple", "orange"]).default("yellow"),
  pinned: z.boolean().default(false),
});

const UpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().max(5000).optional(),
  color: z.enum(["yellow", "green", "blue", "pink", "purple", "orange"]).optional(),
  pinned: z.boolean().optional(),
});

// GET /api/notes – list all notes for the current tenant
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const notes = await prisma.note.findMany({
    where: { tenantId: auth.tenantId },
    orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
  });

  return NextResponse.json(notes);
}

// POST /api/notes – create a note
export async function POST(req: NextRequest) {
  const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req, ["admin", "cajero", "almacenero"]);
  if (auth instanceof NextResponse) return auth;
  const rl = applyRateLimit(req, "MODERATE", "notes");
  if (rl) return rl;

  const body = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const note = await prisma.note.create({
    data: { ...parsed.data, tenantId: auth.tenantId },
  });

  return NextResponse.json(note, { status: 201 });
}

// PATCH /api/notes?id=xxx – update a note
export async function PATCH(req: NextRequest) {
  const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req, ["admin", "cajero", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const body = await req.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.note.findFirst({ where: { id, tenantId: auth.tenantId } });
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const updated = await prisma.note.update({ where: { id }, data: parsed.data });

  return NextResponse.json(updated);
}

// DELETE /api/notes?id=xxx – delete a note
export async function DELETE(req: NextRequest) {
  const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
  const rl = applyRateLimit(req, "MODERATE", "notes");
  if (rl) return rl;
  const auth = await requireAdmin(req, ["admin", "cajero", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const existing = await prisma.note.findFirst({ where: { id, tenantId: auth.tenantId } });
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await prisma.note.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
