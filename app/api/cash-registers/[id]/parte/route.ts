import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { CashRegistersDB } from "@/lib/db/sales.db";
import { CashRegisterParteDB } from "@/lib/db/cash-register-parte.db";
import { AdminUsersDB } from "@/lib/db/admin-users.db";
import { TurnosDB } from "@/lib/db/turnos.db";
import { requireAdmin } from "@/lib/require-admin";
import { toErrorPayload } from "@/lib/api-error";
import { armarParteDelDia } from "@/lib/caja/parte-del-dia";

/**
 * GET /api/cash-registers/[id]/parte — el parte del día de una caja:
 * efectivo por origen (venta, adelanto, gasto, retiro del dueño…), esperado
 * contra contado y conciliación contra las ventas del sistema en el tramo.
 * Todas las cuentas se hacen acá; la pantalla de Caja sólo las muestra.
 */
const IdSchema = z.string().trim().min(1).max(60);

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const parsed = IdSchema.safeParse((await params).id);
    if (!parsed.success) return NextResponse.json({ error: "Caja inválida" }, { status: 400 });

    const caja = await CashRegistersDB.getById(auth.tenantId, parsed.data);
    if (!caja) return NextResponse.json({ error: "No encontramos esa caja" }, { status: 404 });

    // La cajera ve la caja abierta (la que está cobrando) y las cerradas en
    // las que tuvo turno. El esperado/contado/diferencia de la caja de otro
    // turno no es suyo: 404, igual que una caja que no existe.
    if (auth.role === "cajero" && caja.status !== "abierta") {
      const adminUserId = await AdminUsersDB.resolveIdByUsername(auth.tenantId, auth.username);
      const suya = adminUserId ? await TurnosDB.tieneTurnoEnCaja(auth.tenantId, adminUserId, caja.id) : false;
      if (!suya) return NextResponse.json({ error: "No encontramos esa caja" }, { status: 404 });
    }

    const desde = new Date(caja.openedAt);
    const hasta = caja.closedAt ? new Date(caja.closedAt) : new Date();
    const { ventas, truncado } = await CashRegisterParteDB.ventasDelTramo(auth.tenantId, desde, hasta);

    return NextResponse.json(armarParteDelDia(caja, ventas, { truncado }));
  } catch (err) {
    const { payload, status } = toErrorPayload(err);
    return NextResponse.json(payload, { status });
  }
}
