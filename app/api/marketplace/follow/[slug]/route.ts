/**
 * /api/marketplace/follow/[slug]
 *
 * TS-15 server-side — endpoint dual-write para seguir/dejar de seguir tienda.
 *
 * Estado actual: persistencia en log estructurado para analytics + futuro
 * push notifications. Sin tabla `StoreFollow` todavía — cuando se agregue,
 * este endpoint escribirá ahí (regla CLAUDE.md 14: schema drift requiere
 * migration explícita).
 *
 * El cliente sigue persistiendo en localStorage (useFollowedStores). Este
 * endpoint complementa, no reemplaza.
 *
 * Sprint 6 marketplace blueprint.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { applyRateLimit } from "@/lib/rate-limit";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { MarketplaceStoresDB } from "@/lib/db/marketplace.db";
import { logger } from "@/lib/logger";

const ParamsSchema = z.object({
  slug: z.string().min(1).max(120),
});

const BodySchema = z.object({
  phone: z.string().min(6).max(20).optional(),
});

interface RouteContext {
  params: Promise<{ slug: string }>;
}

async function verifyStoreExists(slug: string): Promise<boolean> {
  try {
    // MarketplaceStoresDB.getBySlug filtra `isPublished: true` — antes el
    // findUnique permitía probe de existencia de slugs ocultos.
    const found = await MarketplaceStoresDB.getBySlug(slug);
    return Boolean(found);
  } catch (e) {
    logger.warn("[follow] store lookup failed", { error: String(e), slug });
    return true; // tolerante en dev — no bloquear si DB caída
  }
}

/** POST — sigue la tienda. Idempotente. */
export async function POST(req: NextRequest, ctx: RouteContext) {
  const limited = applyRateLimit(req, "MODERATE", "marketplace-follow");
  if (limited) return limited;
  const traceId = newTraceId();
  try {
    const params = await ctx.params;
    const parsedParams = ParamsSchema.safeParse(params);
    if (!parsedParams.success) {
      return NextResponse.json({ error: "slug inválido" }, { status: 400 });
    }
    const body = await req.json().catch(() => ({}));
    const parsedBody = BodySchema.safeParse(body);
    if (!parsedBody.success) {
      return NextResponse.json({ error: "Body inválido" }, { status: 400 });
    }

    const exists = await verifyStoreExists(parsedParams.data.slug);
    if (!exists) {
      return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 });
    }

    // Persistencia futura: cuando exista StoreFollow, hacer upsert.
    // Por ahora registramos para analytics + future push.
    logger.info("[follow] follow event", {
      slug: parsedParams.data.slug,
      phone: parsedBody.data.phone ?? "anon",
      action: "follow",
      traceId,
    });

    return NextResponse.json({ ok: true, queued: true });
  } catch (err) {
    logger.error("[follow POST]", { error: String(err) });
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}

/** DELETE — deja de seguir. Idempotente. */
export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const limited = applyRateLimit(req, "MODERATE", "marketplace-unfollow");
  if (limited) return limited;
  const traceId = newTraceId();
  try {
    const params = await ctx.params;
    const parsedParams = ParamsSchema.safeParse(params);
    if (!parsedParams.success) {
      return NextResponse.json({ error: "slug inválido" }, { status: 400 });
    }
    const body = await req.json().catch(() => ({}));
    const parsedBody = BodySchema.safeParse(body);
    if (!parsedBody.success) {
      return NextResponse.json({ error: "Body inválido" }, { status: 400 });
    }

    logger.info("[follow] unfollow event", {
      slug: parsedParams.data.slug,
      phone: parsedBody.data.phone ?? "anon",
      action: "unfollow",
      traceId,
    });

    return NextResponse.json({ ok: true, queued: true });
  } catch (err) {
    logger.error("[follow DELETE]", { error: String(err) });
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
