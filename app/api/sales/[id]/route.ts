import { NextRequest, NextResponse } from "next/server";
import { SalesDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";
import { withDbRetry } from "@/lib/db-retry";
import { applyRateLimit } from "@/lib/rate-limit";
import { anotarComprobanteSchema, comprobanteAGuardar } from "@/lib/ventas/comprobante-sunat";

// SECURITY 2026-05-05 (audit POS #1+#2):
// - GET previo ignoraba el `id` y retornaba TODAS las ventas (`SalesDB.getAll`).
// - POST previo creaba ventas sin re-hidratar precio desde DB ni validar
//   tenantId del producto (vector cerrado en `app/api/sales/route.ts`, pero
//   reabierto aquí). Cajero malicioso podía vender S/100 por S/0.01 si llamaba
//   este endpoint en vez del raíz.
// Fix: GET filtra por id + tenantId; POST eliminado — la creación va por
// `app/api/sales/route.ts` (precios DB + tx ACID).

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  try {
    const sale = await withDbRetry(() => SalesDB.getById(auth.tenantId, id));
    if (!sale) return NextResponse.json({ error: "Sale not found" }, { status: 404 });
    return NextResponse.json(sale);
  } catch (e) {
    logger.error("[sales/id] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

/**
 * PATCH — anota el comprobante que SUNAT emitió para la venta (factura o
 * boleta hecha en SOL) o lo quita (`quitar: true`). Mismos roles que leerla:
 * el cajero emite boletas en el mostrador.
 *
 * Cuerpo: `{ tipo: "factura"|"boleta", numero: "E001-318", ruc?, reemplazar? }`.
 * 400 = número/serie/RUC mal formados · 404 = no existe en este negocio (otro
 * tenant incluido: el WHERE lleva el tenant de la sesión) · 409 = ya tiene
 * OTRO número y no se pidió `reemplazar`.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;
  const rl = applyRateLimit(req, "MODERATE", "sales-comprobante");
  if (rl) return rl;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "datos_invalidos", message: "El cuerpo no es JSON." }, { status: 400 });
  }
  const parsed = anotarComprobanteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "datos_invalidos",
        message: parsed.error.issues[0]?.message ?? "Datos inválidos",
        issues: parsed.error.issues.map((i) => ({ campo: i.path.join("."), problema: i.message })),
      },
      { status: 400 },
    );
  }

  try {
    const r = await SalesDB.anotarComprobante(auth.tenantId, id, comprobanteAGuardar(parsed.data), {
      reemplazar: parsed.data.reemplazar === true,
      user: auth.username ?? "unknown",
    });
    if (!r.ok && r.reason === "no_existe") return NextResponse.json({ error: "Sale not found" }, { status: 404 });
    if (!r.ok) {
      return NextResponse.json(
        {
          error: "ya_tiene_comprobante",
          actual: r.actual,
          message: `La venta ya tiene ${r.actual.tipo ?? "comprobante"} ${r.actual.numero}. Para cambiarlo manda reemplazar: true.`,
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: true, cambio: r.cambio, venta: r.venta });
  } catch (e) {
    logger.error("[sales/id] PATCH comprobante error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
