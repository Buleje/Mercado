/**
 * POST /api/superadmin/roadmap/items/[itemId]/status
 *
 * Actualiza el estado mutable de un item del roadmap (status/progress/notes).
 * Usa upsert: crea la fila si no existe, actualiza si existe. Auto-gestiona
 * startedAt/completedAt según la transición.
 *
 * Auth: superadmin platform session.
 * Multi-tenant: NO — platform-level.
 *
 * Body schema (Zod safeParse):
 *   {
 *     status?: "planned" | "in_progress" | "done" | "blocked" | "skipped",
 *     progress?: number (0-100),
 *     notes?: string (max 2000 chars),
 *   }
 */

import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { applyRateLimit } from "@/lib/rate-limit";
import { ROADMAP_ITEMS_BY_ID } from "@/lib/roadmap/items";
import { RoadmapStatusDB } from "@/lib/db/roadmap-status.db";

async function requirePlatform(req: NextRequest) {
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) return null;
  return getPlatformSession(token);
}

const UpdateStatusSchema = z.object({
  status: z
    .enum(["planned", "in_progress", "done", "blocked", "skipped"])
    .optional(),
  progress: z.number().int().min(0).max(100).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ itemId: string }> },
) {
  const rateLimited = applyRateLimit(req, "MODERATE", "sa-roadmap-update");
  if (rateLimited) return rateLimited;

  const session = await requirePlatform(req);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { itemId } = await context.params;

  // Valida que el itemId exista en el catálogo estático
  if (!ROADMAP_ITEMS_BY_ID[itemId]) {
    return NextResponse.json(
      { error: "item_not_found", itemId },
      { status: 404 },
    );
  }

  // Parse body (CLAUDE.md regla #2 — safeParse, NUNCA parse)
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = UpdateStatusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "invalid_payload",
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  // Al menos uno de los campos debe estar presente
  if (
    parsed.data.status === undefined &&
    parsed.data.progress === undefined &&
    parsed.data.notes === undefined
  ) {
    return NextResponse.json(
      { error: "empty_update", hint: "Provide at least one of: status, progress, notes" },
      { status: 400 },
    );
  }

  try {
    const updated = await RoadmapStatusDB.upsert(itemId, {
      ...parsed.data,
      updatedBy: session.username,
    });
    return NextResponse.json({ ok: true, itemId, state: updated });
  } catch (err) {
    console.error("[superadmin/roadmap/items/status] upsert failed:", err);
    return NextResponse.json(
      {
        error: "upsert_failed",
        message: (err as Error).message,
      },
      { status: 500 },
    );
  }
}
