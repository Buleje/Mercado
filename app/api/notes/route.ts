import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { NotesDB } from "@/lib/db/notes.db";
import { z } from "zod";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { logger } from "@/lib/logger";

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
  try {
    const auth = await requireAdmin(req, ["admin", "cajero", "almacenero"]);
    if (auth instanceof NextResponse) return auth;

    const notes = await NotesDB.list(auth.tenantId);
    return NextResponse.json(notes);

  } catch (e) {
    logger.error("[get] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// POST /api/notes – create a note
export async function POST(req: NextRequest) {
  try {
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

    const note = await NotesDB.create(auth.tenantId, parsed.data);
    return NextResponse.json(note, { status: 201 });

  } catch (e) {
    logger.error("[post] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// PATCH /api/notes?id=xxx – update a note
export async function PATCH(req: NextRequest) {
  try {
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

    const updated = await NotesDB.updateForTenant(auth.tenantId, id, parsed.data);
    if (!updated) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json(updated);

  } catch (e) {
    logger.error("[patch] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// DELETE /api/notes?id=xxx – delete a note
export async function DELETE(req: NextRequest) {
  try {
    const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
    const rl = applyRateLimit(req, "MODERATE", "notes");
    if (rl) return rl;
    const auth = await requireAdmin(req, ["admin", "cajero", "almacenero"]);
    if (auth instanceof NextResponse) return auth;

    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const ok = await NotesDB.deleteForTenant(auth.tenantId, id);
    if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true });

  } catch (e) {
    logger.error("[delete] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
