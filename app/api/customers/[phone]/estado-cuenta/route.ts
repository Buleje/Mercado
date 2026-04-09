import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

// GET /api/customers/[phone]/estado-cuenta
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ phone: string }> },
) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { phone } = await params;
    const decodedPhone = decodeURIComponent(phone);

    // Get customer
    const customer = await prisma.customer.findFirst({
      where: { phone: decodedPhone, tenantId: auth.tenantId },
      select: {
        phone: true,
        name: true,
        loyaltyPoints: true,
        loyaltyTier: true,
        totalSpent: true,
        creditBalance: true,
      },
    });

    if (!customer) {
      return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
    }

    // Get fiados activos (enum uses ACTIVO uppercase)
    const fiados = await prisma.fiado.findMany({
      where: {
        customerId: decodedPhone,
        tenantId: auth.tenantId,
        status: "ACTIVO",
      },
      orderBy: { createdAt: "desc" },
    });

    // Get prestamos activos (enum uses ACTIVO uppercase)
    const prestamos = await prisma.prestamo.findMany({
      where: {
        customerId: decodedPhone,
        tenantId: auth.tenantId,
        status: "ACTIVO",
      },
      include: {
        cuotas: {
          where: { pagadoEn: null },
          orderBy: { fechaVence: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Get last 10 orders
    const ultimasCompras = await prisma.order.findMany({
      where: {
        customerPhone: decodedPhone,
        tenantId: auth.tenantId,
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        total: true,
        status: true,
        paymentMethod: true,
        createdAt: true,
      },
    });

    // Compute totals — Decimal fields need Number() conversion
    const totalFiados = fiados.reduce((s, f) => s + Number(f.saldo), 0);
    const totalPrestamos = prestamos.reduce((s, p) => {
      // saldoPendiente = sum of unpaid cuotas
      const saldo = p.cuotas.reduce((cs, c) => cs + Number(c.monto), 0);
      return s + saldo;
    }, 0);
    const cuotasPendientes = prestamos.reduce((s, p) => s + p.cuotas.length, 0);

    return NextResponse.json({
      cliente: {
        ...customer,
        totalSpent: Number(customer.totalSpent),
        creditBalance: Number(customer.creditBalance),
      },
      resumen: {
        totalFiados,
        fiadosActivos: fiados.length,
        totalPrestamos,
        prestamosActivos: prestamos.length,
        cuotasPendientes,
        puntosLealtad: customer.loyaltyPoints,
        tierLealtad: customer.loyaltyTier,
        ultimaCompra: ultimasCompras[0]?.createdAt ?? null,
      },
      fiados: fiados.map((f) => ({
        id: f.id,
        descripcion: f.descripcion ?? "",
        total: Number(f.total),
        saldo: Number(f.saldo),
        fechaCreacion: f.createdAt.toISOString(),
        fechaVence: f.fechaVence ? f.fechaVence.toISOString() : null,
      })),
      prestamos: prestamos.map((p) => ({
        id: p.id,
        monto: Number(p.monto),
        saldoPendiente: p.cuotas.reduce((s, c) => s + Number(c.monto), 0),
        cuotasPendientes: p.cuotas.map((c) => ({
          id: c.id,
          numero: c.numeroCuota,
          monto: Number(c.monto),
          fechaVence: c.fechaVence.toISOString(),
          status: c.pagadoEn ? "pagado" : "pendiente",
        })),
        fechaCreacion: p.createdAt.toISOString(),
      })),
      ultimasCompras: ultimasCompras.map((o) => ({
        id: o.id,
        total: o.total,
        status: o.status,
        metodoPago: o.paymentMethod,
        fecha: o.createdAt.toISOString(),
      })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("[customers/estado-cuenta] GET error", { error: msg });
    return NextResponse.json({ error: "Error al consultar estado de cuenta" }, { status: 500 });
  }
}
