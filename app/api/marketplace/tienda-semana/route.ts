/**
 * GET/POST /api/marketplace/tienda-semana
 *
 * Votación "Tienda de la semana" (engagement del cliente en el home del
 * marketplace). Conteos por tienda y semana ISO. Tabla raw
 * `MarketplaceWeeklyVote` (storeSlug, week, count) — no en schema.prisma,
 * se consulta con SQL parametrizado ($1 $2, sin interpolación).
 *
 * Dedupe de voto: client-side (localStorage por semana). Feature no crítica;
 * el server solo agrega. @cross-tenant intentional (público marketplace).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

type VoteRow = { storeSlug: string; count: number };

/** Semana ISO actual, ej "2026-W23". */
function currentIsoWeek(): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayNum = (d.getUTCDay() + 6) % 7; // lunes=0
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // jueves de esta semana
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week =
    1 +
    Math.round(
      ((d.getTime() - firstThursday.getTime()) / 86400000 -
        3 +
        ((firstThursday.getUTCDay() + 6) % 7)) /
        7,
    );
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

async function readVotes(week: string): Promise<VoteRow[]> {
  const rows = await prisma.$queryRawUnsafe<Array<{ storeSlug: string; count: number | bigint }>>(
    `SELECT "storeSlug", "count" FROM "MarketplaceWeeklyVote" WHERE "week" = $1`,
    week,
  );
  return rows.map((r) => ({ storeSlug: r.storeSlug, count: Number(r.count) }));
}

export async function GET(req: NextRequest) {
  const rl = applyRateLimit(req, "GENEROUS", "tienda-semana-get");
  if (rl) return rl;
  const week = currentIsoWeek();
  try {
    const votes = await readVotes(week);
    return NextResponse.json({ week, votes }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    logger.error("[tienda-semana GET] failed", { err: String(err) });
    return NextResponse.json({ week, votes: [] });
  }
}

const PostSchema = z.object({ storeSlug: z.string().min(1).max(120) });

export async function POST(req: NextRequest) {
  const rl = applyRateLimit(req, "MODERATE", "tienda-semana-vote");
  if (rl) return rl;
  try {
    const raw = await req.json();
    const parsed = PostSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }
    const { storeSlug } = parsed.data;
    const week = currentIsoWeek();
    await prisma.$executeRawUnsafe(
      `INSERT INTO "MarketplaceWeeklyVote" ("storeSlug", "week", "count", "updatedAt")
       VALUES ($1, $2, 1, now())
       ON CONFLICT ("storeSlug", "week")
       DO UPDATE SET "count" = "MarketplaceWeeklyVote"."count" + 1, "updatedAt" = now()`,
      storeSlug,
      week,
    );
    const votes = await readVotes(week);
    return NextResponse.json({ ok: true, week, votes });
  } catch (err) {
    logger.error("[tienda-semana POST] failed", { err: String(err) });
    return NextResponse.json({ error: "No se pudo registrar tu voto" }, { status: 500 });
  }
}
