import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/auth/customer-lookup?phone=51999...
 *
 * Devuelve datos básicos del customer (name + dni) si ya existe en la
 * base, para que el AuthModal autocomplete los campos al tipear el
 * teléfono. NO crea ni envía OTP. Sin auth — si el phone existe en
 * cualquier tenant, se devuelven los datos públicos básicos.
 *
 * Privacidad: solo se exponen `name` y `dni` (no email ni dirección),
 * y el endpoint es idempotente. Rate-limit aplica via proxy global.
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
  const phone = parsed.data.phone.replace(/\D/g, "");
  try {
    const customer = await prisma.customer.findUnique({
      where: { phone },
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
