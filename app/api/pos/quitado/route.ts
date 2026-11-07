import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { AdminUsersDB } from "@/lib/db/admin-users.db";
import { TurnosDB } from "@/lib/db/turnos.db";
import { PosControlCajerosDB } from "@/lib/db/pos-control-cajeros.db";
import { RUTAS_PANEL } from "@/lib/auth/roles-rutas-panel";
import { parsearMes, rangoDelMesLima, mesLima } from "@/lib/finance/ingresos-del-periodo";
import { ACCION_QUITADO, ENTIDAD_QUITADO, armarDetalle, leerDetalle } from "@/lib/pos/quitados";

/**
 * POST /api/pos/quitado — el POS avisa que quitó productos del ticket ANTES de
 * cobrar (la X de una línea o «Vaciar carrito»). Queda un renglón en el
 * registro de actividad con el producto, la cantidad, el monto, quién y en qué
 * turno. El POS no espera la respuesta: si esto falla, la venta sigue.
 *
 * GET /api/pos/quitado?usuario=<username>&mes=YYYY-MM — el detalle de un
 * cajero para el «⋯» de Turnos › Cajeros (sólo dueño, admin y encargado).
 */

const LineaSchema = z.object({
  productoId: z.number().int().nonnegative(),
  nombre: z.string().trim().min(1).max(200),
  cantidad: z.number().positive().max(100_000),
  precio: z.number().nonnegative().max(1_000_000),
  descuentoPct: z.number().min(0).max(100).optional(),
});

const QuitadoSchema = z.object({
  motivo: z.enum(["linea", "vaciar"]),
  lineas: z.array(LineaSchema).min(1).max(100),
});

/** Quienes cobran en el POS: los mismos de `POST /api/sales`. */
const ROLES_POS = RUTAS_PANEL["/api/sales"];
const ROLES_GESTION = ["admin", "owner", "manager"] as const;

export async function POST(req: NextRequest) {
  // Un cajero quita varias líneas seguidas y todas las PC de una bodega
  // comparten IP: el nivel generoso (100 por minuto), no el moderado.
  const _rl = applyRateLimit(req, "GENEROUS", "pos-quitado");
  if (_rl) return _rl;
  const auth = await requireAdmin(req, ROLES_POS);
  if (auth instanceof NextResponse) return auth;

  const raw = await req.json().catch(() => null);
  const parsed = QuitadoSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) },
      { status: 400 },
    );
  }

  try {
    // El turno abierto de quien quitó: así la ficha del turno lo encuentra.
    const adminUserId = await AdminUsersDB.resolveIdByUsername(auth.tenantId, auth.username);
    const turno = adminUserId ? await TurnosDB.getActivo(auth.tenantId, adminUserId) : null;
    const detalle = armarDetalle(parsed.data.motivo, parsed.data.lineas, turno?.id ?? null);
    await logActivity(
      ACCION_QUITADO,
      ENTIDAD_QUITADO,
      JSON.stringify(detalle),
      turno?.id,
      auth.username,
      undefined,
      auth.tenantId,
    );
    return NextResponse.json({ ok: true, monto: detalle.monto, unidades: detalle.unidades }, { status: 201 });
  } catch (e) {
    logger.error("[pos/quitado] POST", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "No se pudo registrar" }, { status: 503 });
  }
}

export async function GET(req: NextRequest) {
  const _rl = applyRateLimit(req, "SHELL_POLL", "pos-quitado-get");
  if (_rl) return _rl;
  const auth = await requireAdmin(req, ROLES_GESTION);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const usuario = searchParams.get("usuario")?.trim() ?? "";
  if (!usuario || usuario.length > 120) {
    return NextResponse.json({ error: "Falta el cajero" }, { status: 400 });
  }
  const mes = parsearMes(searchParams.get("mes")) ?? mesLima(new Date());
  const { start, end } = rangoDelMesLima(mes);

  try {
    const filas = await PosControlCajerosDB.quitadosDelMes(auth.tenantId, start, end, usuario);
    const delCajero = filas
      .map((r) => ({ id: r.id, creadoEn: new Date(r.createdAt).toISOString(), detalle: leerDetalle(r.detail) }))
      .filter((r) => r.detalle !== null);
    return NextResponse.json({ mes, usuario, quitados: delCajero });
  } catch (e) {
    logger.error("[pos/quitado] GET", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
