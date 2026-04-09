/**
 * GET /api/superadmin/roadmap/items
 *
 * Devuelve los 84 items del Master Roadmap 2026-04-09 mergeados con su estado
 * mutable (RoadmapItemStatus). Items sin row en DB se consideran "planned"
 * por default.
 *
 * Auth: superadmin platform session (bsm-platform-sess cookie).
 * Multi-tenant: NO — es platform-level (global).
 *
 * Rate limit: GENEROUS (lecturas frecuentes del dashboard roadmap).
 */

import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { applyRateLimit } from "@/lib/rate-limit";
import { ROADMAP_ITEMS, ROADMAP_TOTAL } from "@/lib/roadmap/items";
import { RoadmapStatusDB } from "@/lib/db/roadmap-status.db";

async function requirePlatform(req: NextRequest) {
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) return null;
  return getPlatformSession(token);
}

export async function GET(req: NextRequest) {
  const rateLimited = applyRateLimit(req, "GENEROUS", "sa-roadmap-items");
  if (rateLimited) return rateLimited;

  const session = await requirePlatform(req);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Merge de contenido estático + estado mutable
  let statusMap: Awaited<ReturnType<typeof RoadmapStatusDB.getStatusMap>>;
  try {
    statusMap = await RoadmapStatusDB.getStatusMap();
  } catch (err) {
    // Si la tabla aún no existe (migración pendiente) devolvemos el catálogo
    // con todos los items en "planned" — permite que el módulo funcione sin DB.
    console.warn(
      "[superadmin/roadmap/items] RoadmapItemStatus table not reachable, falling back to empty map:",
      (err as Error).message,
    );
    statusMap = new Map();
  }

  const merged = ROADMAP_ITEMS.map((item) => {
    const status = statusMap.get(item.id);
    return {
      ...item,
      state: {
        status: status?.status ?? "planned",
        progress: status?.progress ?? 0,
        startedAt: status?.startedAt ?? null,
        completedAt: status?.completedAt ?? null,
        notes: status?.notes ?? null,
        updatedBy: status?.updatedBy ?? null,
        updatedAt: status?.updatedAt ?? null,
      },
    };
  });

  // Aggregated stats para el header del módulo
  const stats = {
    total: ROADMAP_TOTAL,
    planned: 0,
    in_progress: 0,
    done: 0,
    blocked: 0,
    skipped: 0,
    criticalBugs: 0,
    criticalBugsDone: 0,
  };
  for (const m of merged) {
    stats[m.state.status as keyof Omit<typeof stats, "total" | "criticalBugs" | "criticalBugsDone">] =
      (stats[
        m.state.status as keyof Omit<typeof stats, "total" | "criticalBugs" | "criticalBugsDone">
      ] ?? 0) + 1;
    if (m.isCriticalBug) {
      stats.criticalBugs += 1;
      if (m.state.status === "done") stats.criticalBugsDone += 1;
    }
  }

  return NextResponse.json({
    stats,
    items: merged,
  });
}
