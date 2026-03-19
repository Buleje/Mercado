export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { InventoryMovementsDB } from "@/lib/jsondb";
import { prisma } from "@/lib/prisma";

const CreateSchema = z.object({
  productId: z.number().positive(),
  quantity: z.number().positive(),
  cause: z.enum(["vencimiento", "rotura", "robo", "deterioro", "error-inventario", "daño-transporte"]),
  notes: z.string().max(300).optional(),
  reportedBy: z.string().max(80).optional(),
});

function buildRecord(movement: { id: string; productId: number; quantity: number; lossType?: string; notes?: string; createdAt: string }, product: { name: string; category: string; costPrice: number | null } | undefined) {
  const unitCost = product?.costPrice ?? 0;
  const noteText = movement.notes || "";
  const reportedByMatch = noteText.match(/reportado por:([^|]+)/i);
  return {
    id: movement.id,
    date: movement.createdAt,
    productId: movement.productId,
    product: product?.name || `Producto ${movement.productId}`,
    category: product?.category || "General",
    quantity: movement.quantity,
    unitCost,
    totalLoss: movement.quantity * unitCost,
    cause: (movement.lossType || "error-inventario") as "vencimiento" | "rotura" | "robo" | "deterioro" | "error-inventario" | "daño-transporte",
    status: "registrado",
    notes: noteText,
    reportedBy: reportedByMatch?.[1]?.trim() || "Sistema",
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const movements = (await InventoryMovementsDB.getAll(500)).filter((movement) => movement.type === "merma");
  const productIds = [...new Set(movements.map((movement) => movement.productId))];
  const products = productIds.length > 0
    ? await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true, category: true, costPrice: true } })
    : [];
  const productMap = new Map(products.map((product) => [product.id, product]));

  return NextResponse.json(movements.map((movement) => buildRecord(movement, productMap.get(movement.productId))));
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const raw = await req.json();
  const parsed = CreateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos invalidos", issues: parsed.error.issues.map((issue) => issue.message) }, { status: 400 });
  }

  const { productId, quantity, cause, notes, reportedBy } = parsed.data;
  const movement = await InventoryMovementsDB.record({
    productId,
    type: "merma",
    lossType: cause,
    quantity,
    notes: [notes, reportedBy ? `reportado por: ${reportedBy}` : ""].filter(Boolean).join(" | "),
  });

  const product = await prisma.product.findUnique({ where: { id: productId }, select: { name: true, category: true, costPrice: true } });
  return NextResponse.json(buildRecord(movement, product), { status: 201 });
}