import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/auth/customer-lookup?phone=51999...
 *
 * Devuelve datos básicos del customer (name + dni) SOLO si pertenece al
 * tenant del request. SECURITY (2026-04-29): antes era cross-tenant —
 * cualquier persona podía consultar nombre+DNI de cualquier cliente de
 * cualquier tenant solo conociendo el teléfono. Vector Ley 29733 PE.
 */
const QuerySchema = z.object({
  phone: z.string().min(9).max(15),
});

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const parsed = QuerySchema.safeParse({ phone: searchParams.get("phone") });
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Parámetros inválidos" },
      { status: 400 },
    );
  }
  // tenantId resuelto por proxy.ts (header overwrite, NO confía cliente).
  const tenantId = req.headers.get("x-tenant-id");
  if (!tenantId) {
    return NextResponse.json({ ok: true, customer: null });
  }
  const phone = parsed.data.phone.replace(/\D/g, "");
  try {
    const customer = await prisma.customer.findFirst({
      where: { phone, tenantId },
      select: { name: true, tipoDocumento: true, documento: true },
    });
    if (!customer) {
      return NextResponse.json({ ok: true, customer: null });
    }
    const dni =
      customer.tipoDocumento === "DNI" ? customer.documento ?? undefined : undefined;
    return NextResponse.json({
      ok: true,
      customer: {
        name: customer.name ?? undefined,
        dni,
      },
    });
  } catch {
    return NextResponse.json({ ok: false, customer: null });
  }
}
