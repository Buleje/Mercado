import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { PartnerPayoutsDB, type ResultadoAccionRetiro } from "@/lib/db/partner-payouts.db";
import { accionRetiroSchema } from "@/lib/delivery/payout-transiciones";
import { SOLO_EFECTIVO_SALE_DE_CAJA } from "@/lib/caja/egreso-de-caja";
import { soloAdminODueno } from "@/lib/forestal/plata-de-guia-rol";
import { logger } from "@/lib/logger";

/**
 * POST /api/admin/delivery/payouts/:id — el dueño resuelve un retiro.
 *
 *   { accion: "aprobar" }
 *   { accion: "pagar", metodo: "yape" | "efectivo" | "transferencia", salidaDeCaja?, referencia? }
 *   { accion: "rechazar", motivo }
 *   { accion: "deshacer", motivo }   (paid → approved: borra su gasto y devuelve el efectivo a la caja abierta)
 *
 * Pagar crea el gasto «Pago a repartidor · <nombre>» en la misma transacción
 * y, en efectivo con `salidaDeCaja`, el egreso de la caja abierta. Repetir la
 * misma acción responde 200 con `yaEstaba: true` y no escribe nada (un doble
 * clic no paga dos veces). Un retiro de otro negocio = 404.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  const prohibido = soloAdminODueno(auth.role, "aprobar, pagar, rechazar o deshacer pagos de retiros del reparto");
  if (prohibido) return prohibido;

  const { id } = await params;
  const body: unknown = await req.json().catch(() => null);
  const parsed = accionRetiroSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const input = parsed.data;
  if (input.accion === "pagar" && input.salidaDeCaja && input.metodo !== "efectivo") {
    return NextResponse.json({ error: SOLO_EFECTIVO_SALE_DE_CAJA }, { status: 400 });
  }

  const usuario = auth.name || auth.username;
  try {
    let res: ResultadoAccionRetiro;
    if (input.accion === "aprobar") res = await PartnerPayoutsDB.aprobar(auth.tenantId, id, usuario);
    else if (input.accion === "rechazar") res = await PartnerPayoutsDB.rechazar(auth.tenantId, id, input.motivo, usuario);
    else if (input.accion === "deshacer") res = await PartnerPayoutsDB.deshacerPago(auth.tenantId, id, input.motivo, usuario);
    else {
      res = await PartnerPayoutsDB.pagar(auth.tenantId, id, {
        metodo: input.metodo,
        salidaDeCaja: input.salidaDeCaja,
        referencia: input.referencia,
        usuario,
      });
    }
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
    return NextResponse.json(res);
  } catch (err) {
    logger.error("[admin/delivery/payouts] POST failed", { error: String(err), tenantId: auth.tenantId, id, accion: input.accion });
    return NextResponse.json({ error: "No pudimos guardar el cambio. Intenta de nuevo." }, { status: 500 });
  }
}
