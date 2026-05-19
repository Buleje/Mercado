import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { requireActiveSubscription } from "@/lib/billing/require-active-subscription";
import { LiveSessionsDB } from "@/lib/db/live-sessions.db";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";

const ScheduleBody = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(2000).optional(),
  thumbnailUrl: z.string().url().max(500).optional(),
  scheduledFor: z.string().datetime(),
  storeId: z.string().max(64).optional(),
  categoryChips: z.array(z.string().max(50)).max(10).optional(),
});

/**
 * GET /api/admin/lives — lista lives del vendor (scheduled + live + past).
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, [
    "admin",
    "tienda_owner",
    "owner",
    "manager",
  ]);
  if (auth instanceof NextResponse) return auth;

  try {
    const [active, upcoming, past] = await Promise.all([
      LiveSessionsDB.listActive(auth.tenantId),
      LiveSessionsDB.listScheduled(auth.tenantId, 30),
      LiveSessionsDB.listPast(auth.tenantId, 20),
    ]);
    const adminStats = await LiveSessionsDB.getAdminStats(auth.tenantId);

    return NextResponse.json({
      data: {
        active,
        upcoming,
        past,
        stats: adminStats,
      },
    });
  } catch (err) {
    logger.error("[api/admin/lives] GET failed", { err: String(err) });
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

/**
 * POST /api/admin/lives — programa una nueva live.
 */
export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "admin-lives"); if (_rl) return _rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req, [
    "admin",
    "tienda_owner",
    "owner",
    "manager",
  ]);
  if (auth instanceof NextResponse) return auth;
  const blocked = await requireActiveSubscription(auth.tenantId);
  if (blocked) return blocked;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = ScheduleBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const scheduledFor = new Date(parsed.data.scheduledFor);
  if (Number.isNaN(scheduledFor.getTime()) || scheduledFor <= new Date()) {
    return NextResponse.json(
      { error: "La fecha debe ser futura" },
      { status: 400 },
    );
  }

  try {
    const session = await LiveSessionsDB.scheduleSession(auth.tenantId, {
      title: parsed.data.title,
      description: parsed.data.description,
      thumbnailUrl: parsed.data.thumbnailUrl,
      scheduledFor,
      storeId: parsed.data.storeId,
      categoryChips: parsed.data.categoryChips,
    });
    return NextResponse.json({ data: session }, { status: 201 });
  } catch (err) {
    logger.error("[api/admin/lives] POST failed", { err: String(err) });
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
