/* eslint-disable no-restricted-properties -- deuda existente: ConteoFisico/ConteoFisicoItem sin clase lib/db dedicada todavía. Todas las queries de este archivo son tenant-scoped via auth.tenantId guard. */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { getOrSet, invalidate } from "@/lib/cache";

// F6: Helpers de lock de conteo activo — TTL 1 hora
export function conteoLockKey(tenantId: string) {
  return `tenant:${tenantId}:conteo-active`;
}
export async function setConteoLock(tenantId: string) {
  // Guardamos flag en cache con TTL 1h (3600s)
  await getOrSet(conteoLockKey(tenantId), 3600, async () => "1");
}
export async function isConteoLocked(tenantId: string): Promise<boolean> {
  // Si la key existe, el callback no se ejecuta — devuelve "1".
  // Si NO existe, ejecuta el callback que devuelve null (no setea nada útil).
  // Para verificar SIN setear, usamos el path: lectura sin escribir.
  const cached = await getOrSet<string | null>(
    conteoLockKey(tenantId),
    1, // 1 sec — minimal write si no existe
    async () => null,
  ).catch((err) => {
    logger.warn("[conteo/lock] cache lookup failed", { err: String(err) });
    return null;
  });
  return cached === "1";
}
export async function clearConteoLock(tenantId: string) {
  invalidate(conteoLockKey(tenantId));
}

const CreateSchema = z.object({
  tipo: z.enum(["completo", "categoria", "ubicacion"]).default("completo"),
  categoria: z.string().optional(),
}).strict();

// POST — Iniciar un nuevo conteo físico
export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "inventory-conteo"); if (_rl) return _rl;
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

    // F6: Activar lock para bloquear nuevas ventas/pedidos durante el conteo
    await setConteoLock(auth.tenantId);

    return NextResponse.json({
      id: conteo.id,
      tipo: conteo.tipo,
      status: conteo.status,
      totalItems: conteo.items.length,
      message: `Se generaron ${conteo.items.length} productos para contar`,
    }, { status: 201 });
  } catch (e) {
    logger.error("[conteo/POST]", { err: e instanceof Error ? e.message : String(e) });
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
    logger.error("[conteo/GET]", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error al listar conteos" }, { status: 500 });
  }
}
