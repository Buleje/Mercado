export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { queue } from "@/lib/queue";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const BodySchema = z.object({
  vendorPhone: z.string().min(1),
  type: z.enum(["new_order", "low_stock", "new_review", "price_alert"]),
  context: z.record(z.string(), z.unknown()),
});

type NotifyContext = Record<string, unknown>;

const TEMPLATES: Record<string, (ctx: NotifyContext) => string> = {
  new_order: (ctx) =>
    `Hola ${ctx.vendorName ?? "vendedor"}, tienes una nueva orden #${ctx.orderId} por S/ ${ctx.total}.`,
  low_stock: (ctx) =>
    `Stock bajo: ${ctx.productName} solo te quedan ${ctx.stock} unidades.`,
  new_review: (ctx) =>
    `Nueva reseña ${ctx.rating}★ de ${ctx.customer} en ${ctx.productName}.`,
  price_alert: (ctx) =>
    `Aviso: ${ctx.productName} marcado para revisión de precio.`,
};

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch((err) => { logger.error("[marketplace/notify-vendor] parse JSON body failed", { error: String(err) }); return null; });
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
  }

  const { vendorPhone, type, context } = parsed.data;

  // SECURITY 2026-05-06 (audit team H003): vendorPhone debe pertenecer a un
  // tenant asociado al admin autenticado. Antes admin de A podía mandar
  // WhatsApp arbitrario a cualquier phone usando branding Buleje (vector
  // spam/phishing).
  const tenantOwnsPhone = await prisma.tenant.findFirst({
    where: { id: auth.tenantId, ownerPhone: vendorPhone },
    select: { id: true },
  });
  if (!tenantOwnsPhone) {
    logger.warn("[marketplace/notify-vendor] phone not in tenant", {
      tenantId: auth.tenantId,
      attemptedPhone: vendorPhone.slice(-4),
    });
    return NextResponse.json(
      { error: "Vendor no asociado al tenant" },
      { status: 403 },
    );
  }

  const message = TEMPLATES[type](context);

  queue
    .enqueue("send-whatsapp", {
      tenantId: auth.tenantId,
      phone: vendorPhone,
      message,
    })
    .catch((err) => logger.error("[marketplace/notify-vendor] operation failed", { error: String(err), tenantId: auth.tenantId }));

  return NextResponse.json({ ok: true }, { status: 202 });
}
