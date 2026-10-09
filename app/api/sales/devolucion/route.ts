import { NextRequest, NextResponse } from "next/server";
import { revalidateTenantTag } from "@/lib/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { DevolucionError, DevolucionesPosDB } from "@/lib/db/devoluciones-pos.db";

const ReturnItemSchema = z.object({
  productId: z.number().int().positive(),
  qty: z.number().int().positive(),
  motivo: z.string().max(200).optional(),
});

const DevolucionSchema = z.object({
  saleId: z.string().min(1),
  items: z.array(ReturnItemSchema).min(1).max(50),
  refundType: z.enum(["efectivo", "credito"]),
  /** uuid que el POS crea al abrir el paso 2: el reintento responde lo mismo sin devolver dos veces. */
  idempotencyKey: z.string().trim().min(8).max(80).optional(),
});

const ROLES = ["admin", "owner", "manager", "cajero"] as const;

/**
 * GET /api/sales/devolucion?saleId=…
 * Lo ya devuelto de una venta (unidades por producto y plata), para que el POS
 * no ofrezca devolver lo que ya volvió y su vista previa use el mismo tope.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ROLES);
  if (auth instanceof NextResponse) return auth;
  if (!auth.tenantId) return NextResponse.json({ error: "Sesión sin tenant válido" }, { status: 401 });

  const saleId = req.nextUrl.searchParams.get("saleId")?.trim();
  if (!saleId) return NextResponse.json({ error: "Falta saleId" }, { status: 400 });
  try {
    const estado = await DevolucionesPosDB.estado(auth.tenantId, saleId);
    if (!estado) return NextResponse.json({ error: "Venta no encontrada" }, { status: 404 });
    return NextResponse.json(estado);
  } catch (e) {
    logger.error("[sales/devolucion] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "No se pudo leer la venta" }, { status: 500 });
  }
}

/**
 * POST /api/sales/devolucion
 * Devuelve productos de una venta: repone stock, deja el `Return` y, si es a
 * crédito, lo suma al cliente. La plata sale de `lib/pos/reembolso.ts`: lo que
 * se cobró de verdad (descuento global y trueque prorrateados), nunca más que
 * `Sale.total` sumando todas las devoluciones de la venta.
 */
export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "sales-devolucion"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ROLES);
  if (auth instanceof NextResponse) return auth;

  // SECURITY 2026-05-17 (audit C1): nunca fallback a "main".
  if (!auth.tenantId) {
    return NextResponse.json({ error: "Sesión sin tenant válido" }, { status: 401 });
  }
  const tenantId = auth.tenantId;

  try {
    const raw = await req.json().catch(() => null);
    const parsed = DevolucionSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos", issues: parsed.error.issues.map(i => i.message) },
        { status: 400 },
      );
    }

    const { saleId, items, refundType, idempotencyKey } = parsed.data;

    // SECURITY 2026-05-05 (audit POS #4): refund efectivo requiere admin o dueño;
    // el cajero solo devuelve a crédito.
    if (refundType === "efectivo" && auth.role !== "admin" && auth.role !== "owner") {
      return NextResponse.json(
        { error: "Refund en efectivo requiere autorización del admin" },
        { status: 403 },
      );
    }

    const r = await DevolucionesPosDB.registrar(tenantId, {
      saleId,
      items,
      refundType,
      idempotencyKey,
      usuario: auth.username,
    });

    if (!r.repetida) {
      logActivity(
        "Devolucion", "venta",
        `Devolucion de S/${r.totalRefund.toFixed(2)} para venta ${saleId.slice(0, 8)} (${refundType})`,
        saleId, auth.username,
      ).catch((err) => logger.warn("[sales/devolucion] activity log failed", { err: String(err) }));

      // El stock se repone por la transacción, salteando ProductsDB: sin esto el
      // Inventario sigue mostrando el stock de antes de que la mercadería volviera.
      revalidateTenantTag(tenantId, "products");
    }

    return NextResponse.json({
      success: true,
      totalRefund: r.totalRefund,
      brutoSinDescuento: r.brutoSinDescuento,
      refundType: r.refundType,
      items: r.items,
      repetida: r.repetida,
    });
  } catch (e) {
    if (e instanceof DevolucionError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    }
    // La misma clave llegó dos veces a la vez sobre ventas distintas: el `Return.id` ya existe.
    if ((e as { code?: string } | null)?.code === "P2002") {
      return NextResponse.json(
        { error: "Esta devolución ya se registró con otra venta. Cierra y vuelve a abrir la devolución.", code: "idempotencia_distinta" },
        { status: 422 },
      );
    }
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("[sales/devolucion] POST error", { err: msg });
    // Pool lleno: no se empezó nada. 503 → el POS reintenta una vez con la misma clave.
    if (/Unable to start a transaction/i.test(msg)) {
      return NextResponse.json({ error: "El sistema está ocupado. Vuelve a intentar en unos segundos." }, { status: 503 });
    }
    return NextResponse.json(
      { error: "Error al procesar la devolucion" },
      { status: 500 },
    );
  }
}
