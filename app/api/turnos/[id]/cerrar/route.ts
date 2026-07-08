import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { TurnosDB } from "@/lib/db/turnos.db";
import { AdminUsersDB } from "@/lib/db/admin-users.db";
import { CashRegistersDB } from "@/lib/jsondb";
import { toNumOrZero } from "@/lib/decimal-utils";
import { requireAdmin } from "@/lib/require-admin";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";

const CerrarTurnoSchema = z.object({
  cierreEfectivo: z.number().min(0),
  notas: z.string().max(1000).optional(),
});

// POST /api/turnos/[id]/cerrar — close turno
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const _rl = await applyRateLimit(req, "MODERATE", "turnos-X-cerrar"); if (_rl) return _rl;
  // Brandon 2026-05-17 (audit C1): lista de roles explícita. Cerrar turno
  // es una acción financiera — solo personal de staff puede ejecutarla.
  const auth = await requireAdmin(req, ["admin", "owner", "manager", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  try {
    const raw = await req.json();
    const parsed = CerrarTurnoSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) },
        { status: 400 },
      );
    }

    // Verify turno exists and belongs to tenant
     
    const existing = await prisma.turno.findUnique({ where: { id } });
    if (!existing || existing.tenantId !== auth.tenantId) {
      return NextResponse.json({ error: "Turno no encontrado" }, { status: 404 });
    }
    if (existing.status !== "ABIERTO") {
      return NextResponse.json({ error: "El turno ya está cerrado" }, { status: 422 });
    }

    // SECURITY 2026-05-17 (audit A1): cajero solo puede cerrar SU turno.
    // Antes cualquier cajero del tenant podía cerrar el turno de otro cajero
    // con un `cierreEfectivo` falsificado → vector de fraude laboral
    // (culpar al compañero por una diferencia inventada).
    // Roles management (admin/owner/manager) siguen pudiendo cerrar cualquier turno.
    //
    // Audit 2026-05-17 B-P0-1: antes se comparaba `existing.adminUserId !== auth.username`
    // pero `Turno.adminUserId` referencia `AdminUser.id` (CUID) mientras
    // `auth.username` es el username del JWT (string humano). Siempre distintos
    // → cajero NUNCA podía cerrar su propio turno (403 garantizado). Ahora
    // resolvemos el id real con AdminUsersDB.resolveIdByUsername (mismo patrón
    // que /api/turnos/activo:25).
    const isCajeroOnly = auth.role === "cajero";
    if (isCajeroOnly) {
      const resolvedId = await AdminUsersDB.resolveIdByUsername(auth.tenantId, auth.username);
      if (!resolvedId || existing.adminUserId !== resolvedId) {
        return NextResponse.json(
          { error: "No tenés permiso para cerrar el turno de otro cajero" },
          { status: 403 },
        );
      }
    }

    // SECURITY 2026-05-07 (T2): aggregate scoped por cajero del turno.
    // Antes sumaba ventas de TODOS los cajeros del tenant durante el periodo →
    // ventasTotal incorrecto en multi-cajero, podia ocultar/fabricar diferencias.
    //
    // FIX 2026-07-08 (reporte ventas-caja bug 3/6): `Sale.cashierId` guarda el
    // `username` (ver app/api/sales POST), NO el `adminUserId` (CUID). Filtrar
    // solo por adminUserId nunca matcheaba → ventasTotal S/0.00 siempre.
    // Resolvemos el username del turno y filtramos por AMBAS formas.
    const cajeroUsername = await AdminUsersDB.getUsernameById(auth.tenantId, existing.adminUserId);
    const cashierIds = [existing.adminUserId, cajeroUsername].filter((v): v is string => !!v);

    const ventasTotal = await prisma.sale.aggregate({
      where: {
        tenantId: auth.tenantId,
        cashierId: { in: cashierIds },
        createdAt: { gte: existing.abrioEn },
      },
      _sum: { total: true },
    });
    // TD-018: _sum.total y existing.inicioEfectivo son Decimal
    const totalVentas = toNumOrZero(ventasTotal._sum.total);

    // T3: cerrar con optimistic lock — si dos requests llegan en paralelo,
    // el segundo recibe null (count === 0) y respondemos 409 (conflict).
    const updated = await TurnosDB.cerrar(id, auth.tenantId, {
      cierreEfectivo: parsed.data.cierreEfectivo,
      ventasTotal: totalVentas,
      notas: parsed.data.notas,
    });

    if (!updated) {
      return NextResponse.json(
        { error: "El turno ya fue cerrado por otro request o no existe" },
        { status: 409 },
      );
    }

    // FIX 2026-07-08 (reporte ventas-caja bug 7/8): cerrar TAMBIÉN la caja
    // vinculada al turno. Antes cerrar el turno dejaba el CashRegister
    // "Abierta" (estado partido) y el arqueo nunca aparecía en Cuadre
    // (CashAuditTab lista registers cerrados). Ahora el cierre del turno
    // cierra su caja con arqueo físico (cierreEfectivo) → el register queda
    // cerrado con expectedAmount/difference calculados desde los movimientos
    // REALES (ventas efectivo + ingresos − egresos), no desde inicio+ventas.
    let cashRegister: Awaited<ReturnType<typeof CashRegistersDB.close>> = null;
    if (existing.cashRegisterId) {
      try {
        const reg = await CashRegistersDB.getById(auth.tenantId, existing.cashRegisterId);
        if (reg && reg.status === "abierta") {
          cashRegister = await CashRegistersDB.close(
            auth.tenantId,
            existing.cashRegisterId,
            parsed.data.cierreEfectivo,
            `Cierre de turno ${id.slice(-6)}`,
          );
        }
      } catch (regErr) {
        logger.warn("[turnos/id/cerrar] cierre de caja vinculada falló (no bloqueante)", {
          id, err: regErr instanceof Error ? regErr.message : String(regErr),
        });
      }
    }

    // FIX 2026-07-08 (reporte ventas-caja bug 6): el "esperado" y la diferencia
    // deben salir de los movimientos reales de caja (incluye ingresos/egresos
    // manuales + solo ventas en EFECTIVO), no de `inicio + ventasTotal` (que
    // ignora egresos y cuenta ventas Yape/tarjeta que no están en el cajón).
    // Si la caja se cerró, usamos sus números; si no hay caja vinculada,
    // caemos al cálculo legacy.
    const expectedAmount = cashRegister?.expectedAmount
      ?? (toNumOrZero(existing.inicioEfectivo) + totalVentas);
    const diferencia = cashRegister?.difference
      ?? (parsed.data.cierreEfectivo - expectedAmount);

    logActivity(
      "Cerrar", "turno",
      `Turno ${id.slice(-6)} cerrado — ventas: S/${totalVentas.toFixed(2)}, diferencia: S/${diferencia.toFixed(2)}`,
      id, auth.username,
    ).catch((err) => logger.warn("[turnos/id/cerrar] activity log failed", { id, err: String(err) }));

    return NextResponse.json({
      ...updated,
      diferencia,
      expectedAmount,
      ventasTotal: totalVentas,
      cashRegisterClosed: !!cashRegister,
    });
  } catch (e) {
    logger.error("[turnos/id/cerrar] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
