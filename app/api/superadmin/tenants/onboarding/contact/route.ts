import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * POST /api/superadmin/tenants/onboarding/contact — marcar contactada /
 * posponer una tienda en activación (#10, Brandon 2026-06-19). Persiste el
 * estado por slug para no re-empujar. El snooze vencido vuelve a "none" solo
 * (se evalúa en el GET de onboarding).
 */

const BodySchema = z.object({
  slug: z.string().min(1).max(120),
  action: z.enum(["contacted", "snooze", "reset"]),
  snoozeDays: z.number().int().min(1).max(90).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requirePlatformAPI(req);
  if ("status" in auth) return auth;

  let raw: unknown;
  try { raw = await req.json(); } catch { raw = {}; }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const { slug, action, snoozeDays } = parsed.data;
  const status = action === "contacted" ? "contacted" : action === "snooze" ? "snoozed" : "none";
  const snoozedUntil = action === "snooze" ? new Date(Date.now() + (snoozeDays ?? 7) * 86_400_000) : null;

  try {
    await prisma.onboardingContact.upsert({
      where: { tenantSlug: slug },
      create: { tenantSlug: slug, status, snoozedUntil, updatedBy: auth.username },
      update: { status, snoozedUntil, updatedBy: auth.username },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error("[tenants/onboarding/contact] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
