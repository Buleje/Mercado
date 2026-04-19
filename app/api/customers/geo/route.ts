import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  // Rate limit por IP antes de validar auth para evitar enumeración
  const rateLimited = applyRateLimit(req, "MODERATE", "customers-geo");
  if (rateLimited) return rateLimited;

  // Auth: solo roles admin/cajero del tenant autenticado
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const customers = await prisma.customer.findMany({
      where: {
        tenantId: auth.tenantId,
        lat: { not: null },
        lng: { not: null },
      },
      select: {
        name: true,
        lat: true,
        lng: true,
        location: true,
        // PII sensible: siempre se fetcha pero solo se expone a admins en el map
        phone: true,
        totalSpent: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const isAdmin = auth.role === "admin";

    const data = customers.map((c) => ({
      name: c.name,
      lat: c.lat!,
      lng: c.lng!,
      location: c.location,
      // phone y totalSpent solo visibles para admin — cajero ve el mapa sin datos financieros/contacto
      ...(isAdmin && {
        phone: c.phone ?? null,
        totalSpent: Number(c.totalSpent ?? 0),
      }),
    }));

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Error cargando datos geo" }, { status: 500 });
  }
}
