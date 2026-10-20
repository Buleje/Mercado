import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { getTenantIdFromRequest } from "@/lib/tenant";
import { runWithAuditContext } from "@/lib/audit/audit-context";
import { aplicarCodigoDeReferida } from "@/lib/referidas/aplicar-codigo";

/**
 * POST /api/referrals/register
 *
 * Anota que la clienta llegó con el código de otra y le da su premio de
 * bienvenida según el programa del negocio (ADR-510; sin config: 10 % en su
 * primera compra). Usa siempre el motor de cupones, por eso exige la sesión
 * verificada de ese celular (antes era público y sin dueño: con celulares
 * ajenos se juntaban cupones; además daba 500 — la tabla `Referral` no existe).
 *
 * Body: { referralCode: string, newCustomerId: string (Customer.phone) }
 * Response: { success, message, couponCode? }
 */

const RegisterReferralSchema = z.object({
  referralCode: z.string().min(1).max(20).trim(),
  newCustomerId: z.string().min(6).max(30).trim(),
});

export async function POST(req: NextRequest) {
  const rl = applyRateLimit(req, "MODERATE", "referrals-register");
  if (rl) return rl;

  const parsed = RegisterReferralSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
  }

  const tenantId = getTenantIdFromRequest(req);
  const { referralCode, newCustomerId } = parsed.data;

  try {
    const r = await runWithAuditContext(req, newCustomerId, () =>
      aplicarCodigoDeReferida(req, tenantId, newCustomerId, referralCode.toUpperCase()),
    );
    /* `null` = el negocio no guardó su programa: no reparte cupones (security 20-10). */
    if (!r) return NextResponse.json({ error: "Esta tienda todavía no tiene «Trae a una amiga»." }, { status: 409 });
    return NextResponse.json({ success: r.ok, message: r.mensaje, couponCode: r.cupon }, { status: r.status });
  } catch (err) {
    logger.error("[referrals/register] Error inesperado", {
      tenantId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Error interno al registrar referido" }, { status: 500 });
  }
}
