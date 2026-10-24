import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ReturnsDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { runWithAuditContext } from "@/lib/audit/audit-context";
import { revalidateTenantTag } from "@/lib/cache";
import { DevolucionError, DevolucionesPosDB, type TipoReembolso } from "@/lib/db/devoluciones-pos.db";
import { DevolucionesPedidoDB } from "@/lib/db/devoluciones-pedido.db";

const ReturnSchema = z.object({
  saleId: z.string().trim().min(1).optional(),
  orderId: z.string().trim().min(1).optional(),
  reason: z.string().max(200).optional(),
  photoUrl: z.string().max(2000).optional(),
  /** Ignorado: el crédito va siempre al cliente de la venta o del pedido (17-10). */
  customerPhone: z.string().max(30).optional(),
  applyCredit: z.boolean().optional(),
  items: z.array(z.object({
    productId: z.number().int().positive(),
    quantity: z.number().positive(),
  })).min(1).max(50),
});
type ReturnBody = z.infer<typeof ReturnSchema>;
type Auth = { tenantId: string; username: string; role: string };

/** Los que tienen `returns: write` en la matriz de roles (admin/dueño/encargado pasan siempre). */
const ROLES_ESCRIBEN = ["admin", "owner", "manager", "cajero", "almacenero"] as const;
const ROLES_LEEN = [...ROLES_ESCRIBEN, "analista"] as const;

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ROLES_LEEN);
  if (auth instanceof NextResponse) return auth;
  const returns = await ReturnsDB.getAll(auth.tenantId);
  return NextResponse.json(returns);
}

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "returns"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ROLES_ESCRIBEN);
  if (auth instanceof NextResponse) return auth;
  // Round 11 M004: audit log de Customer credit + Return + Inventory updates.
  return runWithAuditContext(req, auth.username, () => createReturn(req, auth));
}

async function createReturn(req: NextRequest, auth: Auth): Promise<NextResponse> {
  const parsed = ReturnSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "items requeridos", issues: parsed.error.issues.map((i) => i.message) },
      { status: 400 },
    );
  }
  const { saleId, orderId, reason, items, photoUrl, applyCredit } = parsed.data;

  // ── Anti-fraude (regla #6 / danger-zone): el total y los precios se derivan
  //    del comprobante ORIGINAL (venta u orden), nunca de los precios que manda
  //    el cliente. Sin un comprobante de referencia no se puede validar. ──────
  if (!saleId && !orderId) {
    return NextResponse.json({ error: "saleId u orderId requerido" }, { status: 400 });
  }

  // Igual que en el POS: devolver en efectivo es plata que sale de la caja → sólo admin/dueño.
  // Venta y pedido guardan unidades enteras (`SaleItem`/`OrderItem`/`ReturnItem.quantity` son Int).
  const refundType: TipoReembolso = applyCredit ? "credito" : "efectivo";
  if (refundType === "efectivo" && auth.role !== "admin" && auth.role !== "owner") {
    return NextResponse.json({ error: "Devolver en efectivo requiere autorización del admin" }, { status: 403 });
  }
  if (items.some((i) => !Number.isInteger(i.quantity))) {
    return NextResponse.json({ error: "Se devuelven unidades enteras" }, { status: 400 });
  }

  // Venta del POS: la MISMA cuenta que `/api/sales/devolucion` (17-10). Antes esta rama
  // devolvía `SaleItem.price × cantidad` sin el descuento de cabecera ni el trueque
  // (venta QA `bc19cbe5`: cobró 0,10 → Return de 24,90), no sumaba lo ya devuelto
  // (la misma unidad N veces), acreditaba al teléfono del cuerpo y salteaba el freno
  // «efectivo sólo admin/dueño».
  if (saleId) return devolverVenta(auth, saleId, { items, reason, refundType });
  return devolverPedido(auth, String(orderId), { items, reason, photoUrl, refundType });
}

/**
 * Devolución de un pedido por `DevolucionesPedidoDB.registrar` (17-10): los mismos
 * huecos que tenía la venta — `OrderItem.price × cantidad` sin cupón/promoción/puntos,
 * sin sumar lo ya devuelto, crédito al teléfono del cuerpo, sin transacción ni candado.
 * Ahora: candado por pedido, tope por unidades y por `Order.total` con lo ya devuelto,
 * y el saldo a favor al cliente DEL PEDIDO. El estado del pedido no se toca.
 */
async function devolverPedido(
  auth: Auth,
  orderId: string,
  body: Pick<ReturnBody, "items" | "reason" | "photoUrl"> & { refundType: TipoReembolso },
): Promise<NextResponse> {
  try {
    const r = await DevolucionesPedidoDB.registrar(auth.tenantId, {
      orderId,
      items: body.items.map((i) => ({ productId: i.productId, qty: i.quantity })),
      refundType: body.refundType,
      reason: body.reason,
      photoUrl: body.photoUrl,
      usuario: auth.username,
    });
    revalidateTenantTag(auth.tenantId, "products");
    return NextResponse.json(
      {
        id: r.returnId,
        orderId,
        total: r.totalRefund,
        brutoSinDescuento: r.brutoSinDescuento,
        creditApplied: body.refundType === "credito",
        items: r.items,
      },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof DevolucionError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    }
    throw e;
  }
}

/**
 * Devolución de una venta por `DevolucionesPosDB.registrar`: candado por venta,
 * unidades y plata ya devueltas leídas dentro de la transacción, tope = `Sale.total`
 * (descuento global y trueque prorrateados) y crédito al cliente DE LA VENTA.
 * Sin `applyCredit` el `Return` queda como efectivo (el freno de rol se aplica antes, en `createReturn`).
 */
async function devolverVenta(
  auth: Auth,
  saleId: string,
  body: Pick<ReturnBody, "items" | "reason"> & { refundType: TipoReembolso },
): Promise<NextResponse> {
  const { refundType } = body;
  try {
    const r = await DevolucionesPosDB.registrar(auth.tenantId, {
      saleId,
      items: body.items.map((i) => ({ productId: i.productId, qty: i.quantity, motivo: body.reason })),
      refundType,
      usuario: auth.username,
    });
    revalidateTenantTag(auth.tenantId, "products");
    return NextResponse.json(
      {
        saleId,
        total: r.totalRefund,
        brutoSinDescuento: r.brutoSinDescuento,
        creditApplied: refundType === "credito",
        items: r.items,
      },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof DevolucionError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    }
    throw e;
  }
}
