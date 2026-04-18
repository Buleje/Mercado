import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { invalidateByPrefix } from "@/lib/cache";
import { z } from "zod";
import { logger } from "@/lib/logger";

const UpdateItemSchema = z.object({
  id: z.number().int().positive(),
  price: z.number().positive().optional(),
  active: z.boolean().optional(),
  category: z.string().min(1).max(100).optional(),
  stock: z.number().int().min(0).optional(),
});

const BodySchema = z.object({
  updates: z.array(UpdateItemSchema).min(1).max(500),
});

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch((err) => { logger.error("[marketplace/products/bulk-edit] parse JSON body failed", { error: String(err) }); return null; });
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
  }

  const { updates } = parsed.data;
  const failed: Array<{ id: number; error: string }> = [];
  let updatedCount = 0;

  await prisma.$transaction(async (tx) => {
    for (const item of updates) {
      const { id, ...data } = item;
      try {
        await tx.product.update({
          where: { id, tenantId: auth.tenantId, deletedAt: null },
          data,
        });
        updatedCount++;
      } catch (err) {
        failed.push({ id, error: err instanceof Error ? err.message : "Error desconocido" });
      }
    }
  });

  // Invalidar cache después del commit
  invalidateByPrefix("marketplace:catalog");
  for (const item of updates) {
    if (!failed.find((f) => f.id === item.id)) {
      invalidateByPrefix(`marketplace:product:${item.id}`);
    }
  }

  return NextResponse.json({ updated: updatedCount, failed });
}
