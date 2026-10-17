import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { CotizacionesDB } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";
import { logAudit } from "@/lib/audit-logger";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { vigenciaDesdeEntrada } from "@/lib/cotizaciones/vigencia";
import { idDeProducto } from "@/lib/cotizaciones/disponibilidad";

const CotizacionItemSchema = z.object({
  descripcion: z.string().min(1).max(500),
  cantidad: z.number().positive(),
  precioUnit: z.number().nonnegative(),
  descuento: z.number().min(0).max(100).optional().default(0),
  productoId: z.string().optional(),
});

const CreateCotizacionSchema = z.object({
  clienteNombre: z.string().min(1).max(200),
  clienteRuc: z.string().max(20).optional(),
  customerId: z.string().optional(),
  validoHasta: z.string().datetime({ offset: true }).or(z.string().min(10)),
  items: z.array(CotizacionItemSchema).min(1, "Se requiere al menos un item"),
  notas: z.string().max(2000).optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const sp = req.nextUrl.searchParams;
    const data = await CotizacionesDB.getAll(auth.tenantId, {
      status: sp.get("status") ?? undefined,
      customerId: sp.get("customerId") ?? undefined,
      search: sp.get("search") ?? undefined,
      from: sp.get("from") ?? undefined,
      to: sp.get("to") ?? undefined,
    });
    return NextResponse.json(data);
  } catch (e) {
    logger.error("[cotizaciones] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "cotizaciones"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;

  const raw: unknown = await req.json().catch(() => null);
  const parsed = CreateCotizacionSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }
  const data = parsed.data;
  // «2026-10-22» = vale hasta el final de ese día en Lima (antes se guardaba
  // la medianoche UTC: 19:00 del día anterior, y la lista mostraba otro día).
  const validoHasta = vigenciaDesdeEntrada(data.validoHasta);
  if (!validoHasta) return NextResponse.json({ error: { validoHasta: ["Fecha inválida"] } }, { status: 400 });

  try {
    // El cliente y los productos se enlazan sólo si son de ESTE negocio:
    // `customerId` apunta a `Customer.phone`, único en toda la plataforma.
    const idsProducto = data.items.map((i) => idDeProducto(i.productoId)).filter((n): n is number => n != null);
    const [numero, cliente, productos] = await Promise.all([
      CotizacionesDB.siguienteNumero(auth.tenantId),
      data.customerId ? CotizacionesDB.clienteDelNegocio(auth.tenantId, data.customerId) : Promise.resolve(null),
      CotizacionesDB.productosParaCotizar(auth.tenantId, idsProducto),
    ]);
    if (data.customerId && !cliente) {
      logger.warn("[cotizaciones] customerId ajeno al negocio, se guarda sin enlazar", { tenantId: auth.tenantId });
    }
    const delNegocio = new Set(productos.map((p) => String(p.id)));

    // Calculate totals server-side
    const items = data.items.map((i) => {
      const base = i.cantidad * i.precioUnit;
      const desc = (i.descuento ?? 0) / 100;
      const subtotal = base * (1 - desc);
      const productoId = i.productoId && delNegocio.has(String(idDeProducto(i.productoId))) ? i.productoId : undefined;
      return { ...i, productoId, subtotal };
    });
    const subtotal = items.reduce((s, i) => s + i.subtotal, 0);
    const igv = subtotal * 0.18;
    const total = subtotal + igv;

    const cotizacion = await CotizacionesDB.create(auth.tenantId, {
      numero,
      clienteNombre: data.clienteNombre,
      clienteRuc: data.clienteRuc,
      customerId: cliente?.phone,
      validoHasta,
      subtotal,
      igv,
      total,
      notas: data.notas,
      createdBy: auth.username,
      items,
    });

    logAudit({
      req,
      action: "CREATE",
      entity: "Order",
      entityId: cotizacion.id,
      detail: `Cotización ${numero} creada para ${data.clienteNombre} por S/${total.toFixed(2)}`,
      user: auth.username,
      tenantId: auth.tenantId,
    });

    // Fase 4 perf (2026-05-16): doc-badges sidebar refresca al instante.
    try {
      const { invalidateAdminCache } = await import("@/lib/admin-cache");
      invalidateAdminCache.afterDocument(auth.tenantId);
    } catch { /* fire-and-forget */ }

    return NextResponse.json(cotizacion, { status: 201 });
  } catch (e) {
    logger.error("[cotizaciones] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
