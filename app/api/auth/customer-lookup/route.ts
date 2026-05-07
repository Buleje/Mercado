import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";

/**
 * GET /api/auth/customer-lookup?phone=51999...
 *
 * Devuelve datos básicos del customer (name + dni) SOLO si pertenece al
 * tenant del request. SECURITY 2026-04-29 + 2026-05-06 (audit auth #10):
 * rate-limit STRICT por IP para frenar enumeración de clientes (Ley 29733).
 * Antes 100 req/IP/min permitían inferir todo el padrón de clientes activos
 * + obtener DNI parcial → vector de PII leak.
 */
const QuerySchema = z.object({
  phone: z.string().min(9).max(15),
});

export async function GET(req: NextRequest) {
  // SECURITY 2026-05-06: rate-limit por IP (10 req cada 5 min).
  const rl = applyRateLimit(req, "STRICT", "customer-lookup");
  if (rl) return rl;

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
    // SECURITY 2026-05-06 (pentest H006): NO devolver `name` en endpoint
    // anonymous — permitía mapear phone→name por scraping lento.
    // El `name` real se obtiene desde /api/auth/customer/me autenticado.
    // Mantenemos `exists` + `hasDni` para auto-fill UX en checkout.
    return NextResponse.json({
      ok: true,
      customer: {
        exists: true,
        hasDni: customer.tipoDocumento === "DNI" && !!customer.documento,
      },
    });
  } catch {
    return NextResponse.json({ ok: false, customer: null });
  }
}
