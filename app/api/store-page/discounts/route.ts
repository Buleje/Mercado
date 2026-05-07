/**
 * GET/POST /api/store-page/discounts
 *
 * CRUD basico de descuentos de la tienda. Persiste en `DiscountRule` con
 * scope `tenantId`. Antes (P2 Bug Hunter Report 2026-04-30) era un stub
 * que recibia el body pero NO guardaba — el admin creaba descuentos y al
 * recargar desaparecian.
 *
 * Auth: requireAdmin (admin del tenant). ADR-084 trial guard en POST.
 *
 * Mapping frontend ↔ DB:
 *   frontend.type === "percentage"   → DB.tipo === "porcentaje"
 *   frontend.type === "fixed"        → DB.tipo === "monto_fijo"
 *   frontend.type === "buy_x_get_y"  → DB.tipo === "2x1"
 *   frontend.categoryFilter (string) → DB.categorias (JSON array)
 *   frontend.minPurchase             → DB.condicion (JSON: {"minPurchase": N})
 *   frontend.endsAt                  → DB.fechaFin
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { requireActiveSubscription } from "@/lib/billing/require-active-subscription";
import { prismaForTenant } from "@/lib/tenant";
import { toNumOrZero } from "@/lib/decimal-utils";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

// ─── Mapping helpers ─────────────────────────────────────────────────────────

const FRONT_TO_DB_TYPE = {
  percentage: "porcentaje",
  fixed: "monto_fijo",
  buy_x_get_y: "2x1",
} as const;
type FrontType = keyof typeof FRONT_TO_DB_TYPE;

const DB_TO_FRONT_TYPE: Record<string, FrontType> = {
  porcentaje:  "percentage",
  monto_fijo:  "fixed",
  "2x1":       "buy_x_get_y",
  "3x2":       "buy_x_get_y",
};

// ─── Validacion del body POST ────────────────────────────────────────────────

const PostSchema = z.object({
  name:           z.string().min(1).max(120),
  type:           z.enum(["percentage", "fixed", "buy_x_get_y"]),
  value:          z.number().nonnegative().max(100000),
  minPurchase:    z.union([z.number().nonnegative(), z.string()]).optional(),
  categoryFilter: z.string().max(80).optional(),
  endsAt:         z.string().optional(),
  active:         z.boolean().default(true),
});

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const tx = prismaForTenant(auth.tenantId);
    const rows = await tx.discountRule.findMany({
      where: { tenantId: auth.tenantId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const data = rows.map((r) => {
      let minPurchase: number | null = null;
      try {
        const cond = r.condicion ? JSON.parse(r.condicion) : null;
        if (cond && typeof cond.minPurchase === "number") {
          minPurchase = cond.minPurchase;
        }
      } catch {
        // condicion legacy no-JSON — ignorar
      }

      let categoryFilter: string | null = null;
      try {
        const arr = JSON.parse(r.categorias) as string[];
        if (Array.isArray(arr) && arr.length > 0) categoryFilter = arr[0];
      } catch {
        // categorias legacy no-JSON
      }

      return {
        id:             r.id,
        name:           r.nombre,
        type:           DB_TO_FRONT_TYPE[r.tipo] ?? "percentage",
        value:          toNumOrZero(r.valor),
        minPurchase,
        productIds:     [] as number[],
        categoryFilter,
        startsAt:       r.fechaInicio.toISOString(),
        endsAt:         r.fechaFin.toISOString(),
        active:         r.activa,
        usageCount:     0,
      };
    });

    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    logger.error("[store-page/discounts] GET failed", {
      tenantId: auth.tenantId,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json([], { status: 503 });
  }
}

// ─── POST ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "store-page-discounts"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  const blocked = await requireActiveSubscription(auth.tenantId);
  if (blocked) return blocked;

  const body = await req.json().catch((err) => {
    logger.warn("[store-page/discounts] invalid body", { err: String(err) });
    return null;
  });
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Datos invalidos", issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const f = parsed.data;

  // Normalizar minPurchase (puede venir como "" desde formulario)
  let minPurchaseNum: number | null = null;
  if (typeof f.minPurchase === "number") minPurchaseNum = f.minPurchase;
  else if (typeof f.minPurchase === "string" && f.minPurchase.trim() !== "") {
    const n = Number(f.minPurchase);
    if (Number.isFinite(n) && n >= 0) minPurchaseNum = n;
  }

  // Default fechaFin: si no viene, +30 dias
  const fechaInicio = new Date();
  const fechaFin = f.endsAt && !Number.isNaN(Date.parse(f.endsAt))
    ? new Date(f.endsAt)
    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const categoriasJson = f.categoryFilter && f.categoryFilter.trim() !== ""
    ? JSON.stringify([f.categoryFilter.trim()])
    : "[]";

  const condicionJson = minPurchaseNum != null
    ? JSON.stringify({ minPurchase: minPurchaseNum })
    : null;

  try {
    const tx = prismaForTenant(auth.tenantId);
    const created = await tx.discountRule.create({
      data: {
        nombre:      f.name,
        tipo:        FRONT_TO_DB_TYPE[f.type],
        valor:       f.value,
        categorias:  categoriasJson,
        condicion:   condicionJson,
        fechaInicio,
        fechaFin,
        activa:      f.active,
        tenantId:    auth.tenantId,
      },
    });

    logger.info("[store-page/discounts] created", {
      tenantId: auth.tenantId,
      id: created.id,
      tipo: created.tipo,
    });

    return NextResponse.json(
      {
        ok: true,
        discount: {
          id:             created.id,
          name:           created.nombre,
          type:           f.type,
          value:          toNumOrZero(created.valor),
          minPurchase:    minPurchaseNum,
          productIds:     [],
          categoryFilter: f.categoryFilter ?? null,
          startsAt:       created.fechaInicio.toISOString(),
          endsAt:         created.fechaFin.toISOString(),
          active:         created.activa,
          usageCount:     0,
        },
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    logger.error("[store-page/discounts] POST DB error", {
      tenantId: auth.tenantId,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { ok: false, error: "Error al guardar descuento" },
      { status: 503 },
    );
  }
}
