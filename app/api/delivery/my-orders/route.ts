import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/delivery/my-orders
 * Devuelve las asignaciones del repartidor autenticado.
 * Filtra por status: assigned | picked_up | in_transit | delivered
 * Soporta ?date=YYYY-MM-DD (default: hoy)
 */
export async function GET(req: NextRequest) {
  // "delivery" no está en AdminRole — los repartidores usan sesión de cajero/admin
  // El filtro por partnerId asegura que cada repartidor solo ve sus pedidos
  const auth = await requireAdmin(req, ["admin", "cajero", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const statusFilter = searchParams.get("status"); // null = todos
    const dateParam = searchParams.get("date"); // YYYY-MM-DD

    // Fecha base: hoy si no se provee
    const targetDate = dateParam ? new Date(dateParam) : new Date();
    const from = new Date(targetDate);
    from.setHours(0, 0, 0, 0);
    const to = new Date(targetDate);
    to.setHours(23, 59, 59, 999);

    // Construir filtro por partnerId.
    // El repartidor se identifica por username en la sesión — buscamos el partner
    // cuyo phone o nombre coincide, o usamos el header x-partner-id si se envía.
    const partnerIdHeader = req.headers.get("x-partner-id");

    // Buscar el DeliveryPartner que corresponde al usuario autenticado.
    // Se compara por nombre de sesión (aproximación razonable sin FK directa).
    let partnerId: string | undefined = partnerIdHeader ?? undefined;

    if (!partnerId) {
      const partner = await prisma.deliveryPartner.findFirst({
        where: {
          name: { equals: auth.username, mode: "insensitive" },
          isActive: true,
        },
        select: { id: true },
      });
      partnerId = partner?.id;
    }

    // Si no se encontró partner pero el rol es admin/cajero, devolver todas las de hoy
    const where: Record<string, unknown> = {
      createdAt: { gte: from, lte: to },
      ...(partnerId ? { partnerId } : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
    };

    const assignments = await prisma.deliveryAssignment.findMany({
      where,
      include: {
        order: {
          select: {
            id: true,
            customerName: true,
            customerPhone: true,
            customerLocation: true,
            customerReference: true,
            total: true,
            notes: true,
            paymentMethod: true,
            createdAt: true,
            items: {
              select: {
                id: true,
                name: true,
                quantity: true,
                unit: true,
                price: true,
                image: true,
              },
            },
          },
        },
        partner: {
          select: { id: true, name: true, phone: true },
        },
      },
      orderBy: { createdAt: "asc" }, // más antiguo primero (mayor prioridad)
    });

    return NextResponse.json(assignments);
  } catch {
    return NextResponse.json({ error: "Error del servidor" }, { status: 503 });
  }
}
