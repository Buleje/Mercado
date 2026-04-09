import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const customers = await prisma.customer.findMany({
      where: { lat: { not: null }, lng: { not: null } },
      select: { phone: true, name: true, lat: true, lng: true, totalSpent: true, location: true },
      orderBy: { totalSpent: "desc" },
    });

    const data = customers.map((c) => ({
      phone: c.phone,
      name: c.name,
      lat: c.lat!,
      lng: c.lng!,
      totalSpent: c.totalSpent,
      location: c.location,
    }));

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Error cargando datos geo" }, { status: 500 });
  }
}
