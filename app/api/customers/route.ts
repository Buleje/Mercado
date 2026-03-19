export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { CustomersDB, normalizePhone } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { invalidate } from "@/lib/cache";

const LocationSchema = z.object({
  id: z.string().min(1),
  location: z.string().min(1).max(500),
  reference: z.string().max(300),
});

const CustomerPostSchema = z.object({
  phone: z.string().min(6).max(20),
  name: z.string().min(1).max(100),
  location: z.string().max(500).optional(),
  reference: z.string().max(300).optional(),
  locations: z.array(LocationSchema).optional(),
  activeLocationId: z.string().nullable().optional(),
  birthday: z.string().max(30).nullable().optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  const rl = applyRateLimit(req, "GENEROUS", "customers-get");
  if (rl) return rl;

  try {
    const sp         = req.nextUrl.searchParams;
    const limitParam = sp.get("limit");
    const pageParam  = sp.get("page");
    const cursorParam = sp.get("cursor");
    const search     = sp.get("q");

    let customers = await CustomersDB.getAll();

    if (search) {
      const q = search.toLowerCase();
      customers = customers.filter(c =>
        c.name.toLowerCase().includes(q) || c.phone.includes(q),
      );
    }

    const total = customers.length;

    // Cursor-based pagination — preferred path
    if (cursorParam || (limitParam && !pageParam)) {
      const limit = Math.min(Math.max(parseInt(limitParam ?? "50", 10) || 50, 1), 500);
      let startIdx = 0;
      if (cursorParam) {
        const idx = customers.findIndex(c => c.phone === decodeURIComponent(cursorParam));
        startIdx = idx === -1 ? 0 : idx + 1;
      }
      const page = customers.slice(startIdx, startIdx + limit);
      const nextCursor = page.length === limit && startIdx + limit < total
        ? customers[startIdx + limit]?.phone ?? null
        : null;

      logger.info("[customers] GET cursor", { total, limit, startIdx, nextCursor: !!nextCursor });
      return NextResponse.json(page, {
        headers: {
          "X-Total-Count": String(total),
          ...(nextCursor && { "X-Next-Cursor": encodeURIComponent(nextCursor) }),
        },
      });
    }

    // Legacy offset pagination
    if (limitParam) {
      const limit = Math.min(Math.max(parseInt(limitParam, 10) || 50, 1), 500);
      const page  = Math.max(parseInt(pageParam ?? "1", 10) || 1, 1);
      const start = (page - 1) * limit;
      const slice = customers.slice(start, start + limit);

      return NextResponse.json(slice, {
        headers: {
          "X-Total-Count": String(total),
          "X-Page": String(page),
          "X-Limit": String(limit),
          "X-Total-Pages": String(Math.ceil(total / limit)),
        },
      });
    }

    // Default: apply a safe limit of 500 to avoid unbounded responses
    const defaultLimit = 500;
    const limited = customers.slice(0, defaultLimit);
    const nextCursor = customers.length > defaultLimit
      ? customers[defaultLimit]?.phone ?? null
      : null;

    logger.info("[customers] GET default", { total, returned: limited.length });
    return NextResponse.json(limited, {
      headers: {
        "X-Total-Count": String(total),
        ...(nextCursor && { "X-Next-Cursor": encodeURIComponent(nextCursor) }),
      },
    });
  } catch (e) {
    logger.error("[customers] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  const rl = applyRateLimit(req, "MODERATE", "customers-post");
  if (rl) return rl;

  try {
    const raw = await req.json();
    const parsed = CustomerPostSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) },
        { status: 400 }
      );
    }
    const body = parsed.data;
    const record = await CustomersDB.upsert({
      phone: normalizePhone(body.phone),
      name: body.name,
      location: body.location ?? "",
      reference: body.reference ?? "",
      locations: body.locations ?? [],
      activeLocationId: body.activeLocationId ?? null,
      ...(body.birthday !== undefined && { birthday: body.birthday ?? undefined }),
      loyaltyPoints: 0,
      loyaltyTier: "Nuevo",
      totalSpent: 0,
      creditBalance: 0,
      notifOrderUpdates: true,
      notifPromotions: true,
      notifRestock: true,
    });
    // Audit log — fire-and-forget
    prisma.activityLog.create({
      data: { action: "create", entity: "customer", entityId: record.phone, detail: `Cliente creado: ${record.name} (${record.phone})`, user: auth.username, tenantId: auth.tenantId },
    }).catch(() => {});
    invalidate(`dashboard:${auth.tenantId}`);
    return NextResponse.json(record);
  } catch {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }
}
