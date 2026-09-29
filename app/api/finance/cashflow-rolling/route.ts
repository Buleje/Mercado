import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { applyRateLimit } from "@/lib/rate-limit";
import { computeCashflowRolling } from "@/lib/finance/cashflow-rolling";
import { RRHH_COMPLETO } from "@/lib/rrhh/roles";
import { RUTAS_PANEL } from "@/lib/auth/roles-rutas-panel";
import { canRead, type Role } from "@/lib/auth/role-permissions";

/** La proyección son gastos y cuentas por pagar: hay que poder leer los dos en la matriz. */
function puedeVerProyeccion(role: Role): boolean {
  return canRead(role, "expenses") && canRead(role, "payables");
}

/**
 * GET /api/finance/cashflow-rolling
 *
 * Returns the rolling 13-week cashflow projection for the authenticated
 * tenant. ADR-451: sólo los roles que la matriz deja leer gastos y cuentas por
 * pagar (admin, owner, manager, analista); quien no ve lo ganado de RRHH recibe
 * el cierre SIN nómina (`cierreSinNomina: true`).
 *
 * No query params — 13 weeks is the FP&A standard for this feature.
 */
export async function GET(req: NextRequest) {
  const traceId = newTraceId();
  try {
    // Rate limit first (MODERATE = 20 req / 5 min per IP)
    const limited = applyRateLimit(req, "MODERATE", "cashflow-rolling");
    if (limited) return limited;

    // ADR-451: los roles que la MATRIZ deja leer gastos y cuentas por pagar
    // (admin, owner, manager, analista). El cajero no tiene ninguno → 403.
    const auth = await requireAdmin(req, RUTAS_PANEL["/api/finance/cashflow-rolling"]);
    if (auth instanceof NextResponse) return auth;
    // La matriz manda (también sobre el management-tier de `requireAdmin`).
    if (!puedeVerProyeccion(auth.role)) {
      return NextResponse.json(
        { error: "forbidden", message: "Tu rol no tiene acceso a gastos y cuentas por pagar." },
        { status: 403 },
      );
    }

    // ADR-451: la nómina (sueldos) sólo para quien ve lo ganado en RRHH; al
    // resto `payroll` no le viaja (ausente, `payrollFuente: "sin_permiso"`).
    const result = await computeCashflowRolling(auth.tenantId, { verPlanilla: RRHH_COMPLETO.includes(auth.role) });

    return NextResponse.json(result);
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
