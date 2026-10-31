import { NextResponse, type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { z } from "zod";
import { toNumOrZero } from "@/lib/decimal-utils";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { logActivity } from "@/lib/activity-logger";
import { revisarPisoDePrecios, type CambioDePrecio } from "@/lib/precios/piso-servidor";
import { respuestaBajoPiso, textoBajoPisoConfirmado } from "@/lib/precios/piso";

const PatchItemSchema = z.object({
  productId: z.number().int().positive(),
  newPrice: z.number().positive(),
  newCostPrice: z.number().positive().optional(),
});

const PatchSchema = z.object({
  updates: z.array(PatchItemSchema).min(1).max(500),
  /** Piso de rebajas (Brandon 19-10): sin esto, bajar bajo costo + piso = 409. */
  confirmarBajoPiso: z.boolean().optional(),
});

const PutSchema = z.object({
  percentage: z.number().finite(),
  category: z.string().max(100).optional().nullable(),
  confirmarBajoPiso: z.boolean().optional(),
});

/** «Bajo piso confirmado por <usuario>: …» en el registro de actividad (fire-and-forget). */
function registrarBajoPiso(tenantId: string, usuario: string, avisos: Awaited<ReturnType<typeof revisarPisoDePrecios>>["avisos"]): void {
  if (avisos.length === 0) return;
  logActivity("Precio bajo piso", "producto", textoBajoPisoConfirmado(avisos, usuario), avisos.length === 1 ? String(avisos[0].productId) : undefined, usuario, undefined, tenantId)
    .catch((err) => logger.error("[bulk-price] logActivity bajo piso failed", { error: String(err) }));
}

// PATCH — Actualizar precios individuales masivamente (con historial)
export async function PATCH(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "products-bulk-price"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten() }, { status: 400 });
    }

    const { updates, confirmarBajoPiso } = parsed.data;
    const failed: { productId: number; error: string }[] = [];

    // PERF 2026-05-24: antes era N+1 (findFirst + update + priceHistory.create
    // por item dentro de un for, hasta 500 items = ~1500 queries seriales).
    // Ahora: 1 findMany para ownership + ops en batch dentro de 1 transacción.
    const ids = updates.map((u) => u.productId);
    const existing = await prisma.product.findMany({
      where: { id: { in: ids }, tenantId: auth.tenantId },
      select: { id: true, name: true, price: true, costPrice: true },
    });
    const priceById = new Map(existing.map((p) => [p.id, toNumOrZero(p.price)]));

    // Piso de rebajas: precio y costo leídos acá (el costo nuevo si la fila lo trae).
    const porId = new Map(existing.map((p) => [p.id, p]));
    const cambios: CambioDePrecio[] = [];
    for (const u of updates) {
      const p = porId.get(u.productId);
      if (!p) continue;
      const costo = u.newCostPrice ?? (p.costPrice == null ? null : toNumOrZero(p.costPrice));
      cambios.push({ productId: p.id, nombre: p.name, precioActual: toNumOrZero(p.price), precioNuevo: u.newPrice, costo });
    }
    const { pisoSobreCosto, avisos } = await revisarPisoDePrecios(auth.tenantId, cambios);
    if (avisos.length > 0 && confirmarBajoPiso !== true) {
      return NextResponse.json(respuestaBajoPiso(avisos, pisoSobreCosto), { status: 409 });
    }

    const ops: Prisma.PrismaPromise<unknown>[] = [];
    let updated = 0;

    for (const u of updates) {
      const oldPrice = priceById.get(u.productId);
      if (oldPrice === undefined) {
        // No existe en el tenant del solicitante (ownership) → no se toca.
        failed.push({ productId: u.productId, error: "Producto no encontrado" });
        continue;
      }
      ops.push(
        prisma.product.update({
          where: { id: u.productId },
          data: {
            price: u.newPrice,
            ...(u.newCostPrice !== undefined ? { costPrice: u.newCostPrice } : {}),
          },
        }),
      );
      if (oldPrice !== u.newPrice) {
        ops.push(
          prisma.priceHistory.create({
            data: {
              tenantId: auth.tenantId,
              productId: u.productId,
              oldPrice,
              newPrice: u.newPrice,
            },
          }),
        );
      }
      updated++;
    }

    if (ops.length > 0) {
      await prisma.$transaction(ops);
      // Invalidar el cache de getAll (productos cambiaron de precio).
      revalidateTag(`tenant:${auth.tenantId}:products`, "max");
      registrarBajoPiso(auth.tenantId, auth.username ?? "admin", avisos);
    }

    return NextResponse.json({ updated, failed });
  } catch (e) {
    logger.error("[bulk-price/PATCH]", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error al actualizar precios" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "products-bulk-price"); if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { tenantId } = auth;
    const parsed = PutSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Porcentaje inválido" }, { status: 400 });
    }
    const { percentage, category, confirmarBajoPiso } = parsed.data;

    if (percentage === 0) {
      return NextResponse.json({ error: "Porcentaje inválido" }, { status: 400 });
    }
    if (Math.abs(percentage) > 100) {
      return NextResponse.json({ error: "Porcentaje máximo: ±100%" }, { status: 400 });
    }

    const where: Record<string, unknown> = { tenantId, active: true };
    if (category && category !== "all" && category !== "") {
      where.category = category;
    }

    const products = await prisma.product.findMany({
      where,
      select: { id: true, price: true, name: true, costPrice: true },
    });

    if (products.length === 0) {
      return NextResponse.json(
        { error: "No se encontraron productos", updated: 0 },
        { status: 404 },
      );
    }

    const multiplier = 1 + percentage / 100;
    // TD-018: p.price es Decimal
    const nuevos = products.map((p) => ({ p, precio: Math.round(toNumOrZero(p.price) * multiplier * 100) / 100 }));

    // Piso de rebajas: un % negativo puede dejar productos bajo costo + piso.
    const { pisoSobreCosto, avisos } = await revisarPisoDePrecios(
      tenantId,
      nuevos.map(({ p, precio }) => ({
        productId: p.id,
        nombre: p.name,
        precioActual: toNumOrZero(p.price),
        precioNuevo: precio,
        costo: p.costPrice == null ? null : toNumOrZero(p.costPrice),
      })),
    );
    if (avisos.length > 0 && confirmarBajoPiso !== true) {
      return NextResponse.json(respuestaBajoPiso(avisos, pisoSobreCosto), { status: 409 });
    }

    const updates = nuevos.map(({ p, precio }) =>
      prisma.product.update({
        where: { id: p.id },
        data: { price: precio },
      }),
    );

    await prisma.$transaction(updates);
    revalidateTag(`tenant:${tenantId}:products`, "max");
    registrarBajoPiso(tenantId, auth.username ?? "admin", avisos);

    return NextResponse.json({
      updated: products.length,
      percentage,
      category: category || "all",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("[bulk-price] PUT error", { err: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
