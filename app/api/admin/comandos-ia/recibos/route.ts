/**
 * /api/admin/comandos-ia/recibos — «Lo que hizo la IA» (Comandos IA, 2026-10-09).
 *
 * Cada cosa que la IA hizo por el dueño deja un recibo en `ActivityLog` con
 * `entity = "comando-ia"` y `action = "comando-ia:<tipo>"`. Sin schema nuevo.
 *
 * GET  → últimos 50 recibos del tenant, ya interpretados (resumen, costo, filas,
 *        y si un cambio de precios ya se deshizo). Cualquier rol del panel.
 * POST → un recibo de compra/cobro/documento/mensajes/recordatorio (los de
 *        precios los escribe la ruta de precios dentro de su transacción).
 */
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { ActivityLogDB } from "@/lib/db/activity-log.db";
import { logger } from "@/lib/logger";

const ENTIDAD = "comando-ia";
const PRECIOS = "comando-ia:precios";
const PRECIOS_DESHECHO = "comando-ia:precios-deshecho";

/** Lo que guarda cada recibo en `detail` (JSON). Suelto: los de precios traen además `antes`/`despues`. */
const DetalleSchema = z
  .object({
    v: z.number().optional(),
    resumen: z.string().optional(),
    filas: z.union([z.number(), z.array(z.unknown())]).optional(),
    costoIaUsd: z.number().optional(),
    antes: z.array(z.unknown()).optional(),
  })
  .passthrough();

const ReciboBodySchema = z.object({
  tipo: z.enum(["compra", "cobro", "documento", "mensajes", "recordatorio"]),
  resumen: z.string().trim().min(1).max(200),
  filas: z.union([z.number().int().min(0).max(100_000), z.array(z.unknown()).max(500)]).optional(),
  costoIaUsd: z.number().min(0).max(100).optional(),
  refId: z.string().trim().min(1).max(120).optional(),
});

export interface ReciboIA {
  id: string;
  /** Sufijo de la acción: compra | cobro | documento | mensajes | recordatorio | precios | precios-deshecho | … */
  tipo: string;
  resumen: string;
  /** Cuántas filas tocó (precios cambiados, ítems de la compra…), si se sabe. */
  filas: number | null;
  costoIaUsd: number | null;
  user: string;
  createdAt: string;
  entityId: string | null;
  /** Sólo en `precios`: ya hay un recibo `precios-deshecho` que lo apunta. */
  deshecho: boolean;
}

function contarFilas(d: z.infer<typeof DetalleSchema>): number | null {
  if (typeof d.filas === "number") return d.filas;
  if (Array.isArray(d.filas)) return d.filas.length;
  if (Array.isArray(d.antes)) return d.antes.length;
  return null;
}

export async function GET(req: NextRequest) {
  const rl = applyRateLimit(req, "GENEROUS", "comandos-ia-recibos");
  if (rl) return rl;

  const auth = await requireAdmin(req, ["admin", "owner", "manager", "cajero", "almacenero", "analista"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const filas = await ActivityLogDB.list(auth.tenantId, { entity: ENTIDAD, limit: 50 });
    const deshechos = new Set(
      filas.filter((f) => f.action === PRECIOS_DESHECHO && f.entityId).map((f) => f.entityId as string),
    );
    const recibos: ReciboIA[] = filas.map((f) => {
      let crudo: unknown = null;
      try {
        crudo = JSON.parse(f.detail);
      } catch {
        crudo = null;
      }
      const parsed = DetalleSchema.safeParse(crudo);
      const d = parsed.success ? parsed.data : null;
      return {
        id: f.id,
        tipo: f.action.startsWith(`${ENTIDAD}:`) ? f.action.slice(ENTIDAD.length + 1) : f.action,
        // Todos los recibos hablan de TI («Subiste…», «Cerraste…»); el de Deshacer llega como «Deshice:».
        resumen: (d?.resumen ?? (d ? "" : f.detail)).replace(/^Deshice:/, "Deshiciste:").slice(0, 200) || "Sin detalle",
        filas: d ? contarFilas(d) : null,
        costoIaUsd: d?.costoIaUsd ?? null,
        user: f.user,
        createdAt: f.createdAt.toISOString(),
        entityId: f.entityId,
        deshecho: f.action === PRECIOS && deshechos.has(f.id),
      };
    });
    return NextResponse.json({ recibos });
  } catch (err) {
    logger.error("[comandos-ia/recibos] GET falló", { tenantId: auth.tenantId, err: String(err) });
    return NextResponse.json({ error: "No se pudo leer lo que hizo la IA" }, { status: 500 });
  }
}

/** El `resumen` guardado en el detalle JSON de un recibo; null si no se puede leer. */
function resumenDe(detail: string): string | null {
  try {
    const d: unknown = JSON.parse(detail);
    return d && typeof d === "object" && typeof (d as { resumen?: unknown }).resumen === "string"
      ? (d as { resumen: string }).resumen
      : null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const rl = applyRateLimit(req, "MODERATE", "comandos-ia-recibos-post");
  if (rl) return rl;

  const auth = await requireAdmin(req, ["admin", "cajero", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const raw: unknown = await req.json().catch(() => null);
  const body = ReciboBodySchema.safeParse(raw);
  if (!body.success) {
    return NextResponse.json(
      { error: "Recibo inválido", detalles: body.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) },
      { status: 400 },
    );
  }

  const { tipo, resumen, filas, costoIaUsd, refId } = body.data;
  const action = `${ENTIDAD}:${tipo}`;
  try {
    // Idempotente por refId + resumen: un reintento (doble clic, red que corta tras el
    // write) no deja dos recibos de la misma compra/cobro. El resumen entra en la clave
    // porque un recordatorio tiene DOS recibos legítimos con el mismo refId (lo agendaste
    // / cerraste el seguimiento). Sin columna única no frena dos POST en el mismo
    // milisegundo, pero sí lo que pasa en el panel.
    if (refId) {
      const previos = await ActivityLogDB.list(auth.tenantId, { entity: ENTIDAD, entityId: refId, limit: 20 });
      const previo = previos.find((f) => f.action === action && resumenDe(f.detail) === resumen);
      if (previo) return NextResponse.json({ ok: true, id: previo.id, repetido: true });
    }
    const recibo = await ActivityLogDB.create(auth.tenantId, {
      action,
      entity: ENTIDAD,
      entityId: refId ?? null,
      detail: JSON.stringify({ v: 1, tipo, resumen, filas, costoIaUsd }),
      user: auth.username,
    });
    return NextResponse.json({ ok: true, id: recibo.id }, { status: 201 });
  } catch (err) {
    logger.error("[comandos-ia/recibos] POST falló", { tenantId: auth.tenantId, tipo, err: String(err) });
    return NextResponse.json({ error: "No se pudo guardar el recibo" }, { status: 500 });
  }
}
