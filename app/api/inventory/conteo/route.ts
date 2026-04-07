export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const CreateSchema = z.object({
  tipo: z.enum(["completo", "categoria", "ubicacion"]).default("completo"),
  categoria: z.string().optional(),
});

// POST — Iniciar un nuevo conteo físico
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten() }, { status: 400 });
    }

    const { tipo, categoria } = parsed.data;

    // Build product filter
    const productWhere: Record<string, unknown> = {
      tenantId: auth.tenantId,
      active: true,
      deletedAt: null,
    };
    if (tipo === "categoria" && categoria) {
      productWhere.category = categoria;
    }

    // Get all active products
    const products = await prisma.product.findMany({
      where: productWhere,
      select: { id: true, stock: true },
      orderBy: { name: "asc" },
    });

    if (products.length === 0) {
      return NextResponse.json({ error: "No hay productos activos para contar" }, { status: 400 });
    }

    // Create ConteoFisico + items in a transaction
    const conteo = await prisma.conteoFisico.create({
      data: {
        tenantId: auth.tenantId,
        tipo,
        status: "INICIADO",
        creadoPor: auth.username,
        items: {
          create: products.map(p => ({
            productId: p.id,
            stockSistema: p.stock ?? 0,
          })),
        },
      },
      include: { items: true },
    });

    return NextResponse.json({
      id: conteo.id,
      tipo: conteo.tipo,
      status: conteo.status,
      totalItems: conteo.items.length,
      message: `Se generaron ${conteo.items.length} productos para contar`,
    }, { status: 201 });
  } catch (e) {
    console.error("[conteo/POST]", e);
    return NextResponse.json({ error: "Error al crear conteo" }, { status: 500 });
  }
}

// GET — Listar conteos (filtro opcional por status)
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const status = req.nextUrl.searchParams.get("status") ?? undefined;

  try {
    const conteos = await prisma.conteoFisico.findMany({
      where: {
        tenantId: auth.tenantId,
        ...(status ? { status } : {}),
      },
      include: {
        _count: { select: { items: true } },
      },
      orderBy: { fechaInicio: "desc" },
      take: 50,
    });

    return NextResponse.json(conteos);
  } catch (e) {
    console.error("[conteo/GET]", e);
    return NextResponse.json({ error: "Error al listar conteos" }, { status: 500 });
  }
}
