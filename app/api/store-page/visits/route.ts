import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { StorePageDB } from "@/lib/db/store-page.db";
import { logger } from "@/lib/logger";
import crypto from "node:crypto";

const VisitSchema = z.object({
  tenantSlug: z.string().min(1).max(120),
  sessionId: z.string().max(80).nullable().optional(),
  referrer: z.string().max(500).nullable().optional(),
  utmSource: z.string().max(80).nullable().optional(),
  path: z.string().max(200).nullable().optional(),
});

/**
 * Public beacon endpoint — registra una visita a la página individual.
 * NO requiere auth. Rate-limited por IP hash a nivel de proxy.
 *
 * Recibe el slug del tenant en el body (no del header, porque el cliente
 * puede venir de otro subdominio y el middleware no setea x-tenant-id en
 * endpoints públicos).
 */
export async function POST(req: NextRequest) {
  const raw = await req.json().catch(() => null);
  const parsed = VisitSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false }, { status: 200 });
  }
  const data = parsed.data;

  try {
    // Resolver tenantId real por slug (el slug viene del path /t/[slug])
    const tenant = await prisma.tenant.findFirst({
      where: { OR: [{ id: data.tenantSlug }, { slug: data.tenantSlug }] },
      select: { id: true, active: true },
    });
    if (!tenant || !tenant.active) {
      return NextResponse.json({ ok: true });
    }

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "unknown";
    const ipHash = crypto
      .createHash("sha256")
      .update(ip + (process.env.AUTH_SECRET ?? ""))
      .digest("hex")
      .slice(0, 16);

    // Fire-and-forget (no await el .catch) — regla #7 CLAUDE.md
    StorePageDB.trackVisit(tenant.id, {
      sessionId: data.sessionId ?? null,
      referrer: data.referrer ?? null,
      utmSource: data.utmSource ?? null,
      userAgent: req.headers.get("user-agent"),
      ipHash,
      path: data.path ?? null,
    }).catch((e) =>
      logger.warn("[store-page/visits] trackVisit failed", {
        err: e instanceof Error ? e.message : String(e),
      }),
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error("[store-page/visits] POST error", {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
