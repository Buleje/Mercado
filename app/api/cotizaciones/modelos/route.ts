/**
 * Modelos de cotización de la empresa (F28): los ve todo el equipo, cada uno
 * con su dueño y sus versiones. Viven en el KV del negocio (sin tabla).
 *
 * GET              → { modelos, yo: { usuario, rol } }
 * POST {nombre, items, notas?, reemplazarId?} → { modelo, nuevaVersion }
 *                    409 si el nombre ya existe (no se pisa) o no hay lugar.
 * DELETE ?id=      → 204 · 403 si no es suyo y no es dueño/administrador.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { CotizacionesEquipoDB, GuardarModeloSchema } from "@/lib/db/cotizaciones-equipo.db";
import { MAX_MODELOS_EQUIPO } from "@/lib/cotizaciones/modelos";

const ROLES = ["admin", "owner", "manager"] as const;

const err = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ROLES);
  if (auth instanceof NextResponse) return auth;
  try {
    // `yo`: para que la pantalla sepa cuáles puede cambiar o borrar (el POST/DELETE lo vuelve a revisar).
    const modelos = await CotizacionesEquipoDB.listarModelos(auth.tenantId);
    return NextResponse.json({ modelos, yo: { usuario: auth.username, rol: auth.role } });
  } catch (e) {
    logger.error("[cotizaciones] modelos GET", { err: err(e), tenantId: auth.tenantId });
    return NextResponse.json({ error: "No se pudieron traer los modelos" }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const rl = applyRateLimit(req, "MODERATE", "cotizaciones-modelos");
  if (rl) return rl;
  const auth = await requireAdmin(req, ROLES);
  if (auth instanceof NextResponse) return auth;
  const parsed = GuardarModeloSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Revisa el nombre y los ítems del modelo" }, { status: 400 });
  try {
    const r = await CotizacionesEquipoDB.guardarModelo(auth.tenantId, parsed.data, { usuario: auth.username, rol: auth.role });
    if (r.ok) return NextResponse.json({ modelo: r.modelo, nuevaVersion: r.nuevaVersion }, { status: r.nuevaVersion ? 200 : 201 });
    if (r.motivo === "duplicado") {
      return NextResponse.json(
        { error: `Ya hay un modelo «${r.existente.nombre}» en la empresa.`, motivo: r.motivo, existente: r.existente },
        { status: 409 },
      );
    }
    if (r.motivo === "lleno") {
      return NextResponse.json({ error: `La empresa ya tiene ${MAX_MODELOS_EQUIPO} modelos: borra uno antes.`, motivo: r.motivo }, { status: 409 });
    }
    if (r.motivo === "sin-permiso") {
      return NextResponse.json({ error: "Sólo su dueño o el administrador cambian este modelo.", motivo: r.motivo }, { status: 403 });
    }
    return NextResponse.json({ error: "Ese modelo ya no existe.", motivo: r.motivo }, { status: 404 });
  } catch (e) {
    logger.error("[cotizaciones] modelos POST", { err: err(e), tenantId: auth.tenantId });
    return NextResponse.json({ error: "No se pudo guardar el modelo" }, { status: 503 });
  }
}

export async function DELETE(req: NextRequest) {
  const rl = applyRateLimit(req, "MODERATE", "cotizaciones-modelos");
  if (rl) return rl;
  const auth = await requireAdmin(req, ROLES);
  if (auth instanceof NextResponse) return auth;
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!id || id.length > 40) return NextResponse.json({ error: "Falta el modelo" }, { status: 400 });
  try {
    const r = await CotizacionesEquipoDB.borrarModelo(auth.tenantId, id, { usuario: auth.username, rol: auth.role });
    if (r === "ok") {
      logger.info("[cotizaciones] modelo borrado", { tenantId: auth.tenantId, id, por: auth.username });
      return new NextResponse(null, { status: 204 });
    }
    if (r === "sin-permiso") return NextResponse.json({ error: "Sólo su dueño o el administrador lo borran." }, { status: 403 });
    return NextResponse.json({ error: "Ese modelo ya no existe." }, { status: 404 });
  } catch (e) {
    logger.error("[cotizaciones] modelos DELETE", { err: err(e), tenantId: auth.tenantId });
    return NextResponse.json({ error: "No se pudo borrar el modelo" }, { status: 503 });
  }
}
