import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AdelantoConLiquidacionError, AdelantoNoCancelableError, AdelantosDB, DireccionNoCorregibleError, ReglaDeRecibidoError } from "@/lib/db/adelantos.db";
import { requireAdmin } from "@/lib/require-admin";
import { permisoAdelantos } from "@/lib/adelantos/permisos";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { soloAdminODueno } from "@/lib/forestal/plata-de-guia-rol";
import { motivoSchema } from "@/lib/forestal/motivo";

const PatchSchema = z.object({
  notas: z.string().max(1000).nullable().optional(),
  cancelar: z.boolean().optional(),
  /**
   * Al anular: por qué vía volvió la plata al cajón. Ausente = NO revierte.
   *
   * Anular puede significar que fue un error y el efectivo nunca salió, o que se
   * está dando por perdido. Sólo el primero devuelve plata, y eso lo sabe la
   * persona — por eso es explícito y por defecto no hace nada.
   */
  devolucionCaja: z.enum(["efectivo", "yape", "plin", "tarjeta", "transferencia"]).nullable().optional(),
});

/**
 * (ADR-448) Re-marcar de qué lado está la plata de un adelanto cargado al
 * revés — en Blas, ADL-0003/4 de WASACO son pagos por el aserrío guardados como
 * plata dada. No mueve la caja: lo que entró o salió ese día ya pasó.
 */
const CorregirDireccionSchema = z
  .object({
    action: z.literal("corregirDireccion"),
    direccion: z.enum(["DADO", "RECIBIDO"]),
    conceptoRecibido: z.enum(["SERVICIO", "PRESTAMO"]).nullable().optional(),
    motivo: motivoSchema({ mensaje: "Escribe por qué cambias la dirección (al menos 3 letras)." }),
  })
  .strict();

// GET /api/adelantos/[id]
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const sinPermiso = permisoAdelantos(auth.role, "read");
  if (sinPermiso) return sinPermiso;
  const { id } = await params;
  try {
    const adelanto = await AdelantosDB.getById(auth.tenantId, id);
    if (!adelanto) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    return NextResponse.json(adelanto);
  } catch (e) {
    logger.error("[adelantos/id] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

// PATCH /api/adelantos/[id] — editar notas o cancelar
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
  const _rl = await applyRateLimit(req, "MODERATE", "adelantos"); if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const sinPermiso = permisoAdelantos(auth.role, "write");
  if (sinPermiso) return sinPermiso;
  const { id } = await params;
  try {
    const body: unknown = await req.json().catch(() => null);
    if (body && typeof body === "object" && (body as { action?: unknown }).action === "corregirDireccion") {
      return corregirDireccion(req, auth, id, body);
    }
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) }, { status: 400 });
    }
    /* Anular hace desaparecer una deuda: es `delete` en la matriz (admin y
       dueño; manager NO, aunque pase `requireAdmin(req, ["admin"])` por el bypass
       de gestión). Editar las notas es `write` (arriba). */
    if (parsed.data.cancelar) {
      const sinBorrar = permisoAdelantos(auth.role, "delete");
      if (sinBorrar) return sinBorrar;
    }
    /* ADR-448: anular un RECIBIDO devolviendo la plata la saca de la caja — sólo
       admin o dueño (`manager` pasa el chequeo de arriba por el bypass de gestión). */
    const updated = parsed.data.cancelar
      ? await AdelantosDB.cancel(auth.tenantId, id, parsed.data.devolucionCaja, {
          puedeSacarPlataDeRecibido: soloAdminODueno(auth.role) === null,
        })
      : await AdelantosDB.updateNotas(auth.tenantId, id, parsed.data.notas ?? null);
    if (!updated) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    logActivity(parsed.data.cancelar ? "Cancelar" : "Editar", "adelanto", `Adelanto ${id}`, id, auth.username, undefined, auth.tenantId).catch((err) => logger.error("[adelantos] logActivity failed", { error: String(err) }));
    return NextResponse.json(updated);
  } catch (e) {
    /* Ya anulado o ya liquidado: no hay saldo que devolver. El modal muestra `error` tal cual. */
    if (e instanceof AdelantoNoCancelableError) return NextResponse.json({ error: e.message }, { status: 409 });
    if (e instanceof AdelantoConLiquidacionError) return NextResponse.json({ error: e.message, code: e.code, liquidacion: e.liquidacion }, { status: 409 });
    if (e instanceof ReglaDeRecibidoError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    logger.error("[adelantos/id] PATCH error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

/**
 * PATCH `{ action: "corregirDireccion", direccion, conceptoRecibido?, motivo }`.
 *
 * Sólo admin o dueño: `requireAdmin(req, ["admin"])` deja pasar a `manager`
 * por el bypass de gestión, así que va el chequeo explícito. Cambiar el lado de
 * la plata da vuelta quién le debe a quién.
 */
async function corregirDireccion(
  req: NextRequest,
  auth: { tenantId: string; username: string; role: string },
  id: string,
  body: unknown,
): Promise<NextResponse> {
  const prohibido = soloAdminODueno(auth.role, "corregir de qué lado está la plata de un adelanto");
  if (prohibido) return prohibido;
  const parsed = CorregirDireccionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) }, { status: 400 });
  }
  try {
    const hecho = await AdelantosDB.corregirDireccion(auth.tenantId, id, {
      direccion: parsed.data.direccion,
      conceptoRecibido: parsed.data.conceptoRecibido ?? null,
      motivo: parsed.data.motivo,
      usuario: auth.username,
    });
    if (!hecho) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    /* El rastro (antes → después, motivo) ya quedó en la auditoría DENTRO de la
       transacción de la DB class: acá no se escribe otro renglón. */
    return NextResponse.json({
      ...hecho.adelanto,
      correccion: {
        antes: hecho.antes,
        despues: hecho.despues,
        cajaMovida: false,
        aviso: "La caja no se movió: si ese día la plata entró o salió distinto, anótalo en la caja a mano.",
        excedeLimite: hecho.excedeLimite,
      },
    });
  } catch (e) {
    if (e instanceof DireccionNoCorregibleError) {
      return NextResponse.json(
        { error: e.message, code: e.code, ...(e.movimiento ? { movimiento: e.movimiento } : {}) },
        { status: e.status },
      );
    }
    logger.error("[adelantos/id] corregirDireccion error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

// DELETE /api/adelantos/[id] — soft-cancel (no borra historial)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
  const _rl = await applyRateLimit(req, "MODERATE", "adelantos"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  const sinPermiso = permisoAdelantos(auth.role, "delete");
  if (sinPermiso) return sinPermiso;
  const { id } = await params;
  try {
    // El DELETE no lleva body: cancela sin tocar la caja. Para anular
    // devolviendo el efectivo se usa el PATCH con `devolucionCaja`, que es donde
    // alguien puede decir por qué vía volvió la plata.
    const cancelled = await AdelantosDB.cancel(auth.tenantId, id);
    if (!cancelled) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    logActivity("Cancelar", "adelanto", `Adelanto ${id} cancelado`, id, auth.username, undefined, auth.tenantId).catch((err) => logger.error("[adelantos] logActivity failed", { error: String(err) }));
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof AdelantoNoCancelableError) return NextResponse.json({ error: e.message }, { status: 409 });
    if (e instanceof AdelantoConLiquidacionError) return NextResponse.json({ error: e.message, code: e.code, liquidacion: e.liquidacion }, { status: 409 });
    logger.error("[adelantos/id] DELETE error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
