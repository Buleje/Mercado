import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { limaDateKey } from "@/lib/utils";
import { invalidateAdminCache } from "@/lib/admin-cache";
import { RevendedorasDB } from "@/lib/db/revendedoras.db";
import { CONFIG_REVENDEDORAS_POR_DEFECTO, ConfigRevendedorasSchema } from "@/lib/revendedoras/reglas";

/**
 * Revendedoras (ADR-507) — Clientes › Revendedoras.
 *
 * GET                      → `{ config, porDefecto, categorias, revendedoras, resumen }` (mes de Lima)
 * GET ?vista=precios       → `{ config, productos }` precio por nivel de cada producto
 * GET ?vista=candidatas&q= → clientas que todavía no son revendedoras
 * PUT  config              → las reglas del negocio (`featureFlagsJson.revendedoras`)
 * POST { accion: "marcar" | "quitar", customerId }
 * POST { accion: "cotizar", customerId?, items: [{ productId, cantidad }] } → el pedido cobrado por el servidor
 *
 * Dueño, admin y encargado (`requireAdmin(["admin"])`: el tier de gestión
 * pasa siempre, cajero y almacenero no). Sin sesión, 401.
 */

const SERVICIO = "admin/revendedoras";
const IdCliente = z.string().trim().min(1).max(40);

const PostSchema = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("marcar"), customerId: IdCliente }),
  z.object({ accion: z.literal("quitar"), customerId: IdCliente }),
  z.object({
    accion: z.literal("cotizar"),
    customerId: IdCliente.nullish(),
    items: z
      .array(z.object({ productId: z.number().int().positive(), cantidad: z.number().int().min(0).max(10_000) }))
      .max(200, "Hasta 200 productos por pedido."),
  }),
]);

const errorDe = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function GET(req: NextRequest) {
  const _rl = applyRateLimit(req, "GENEROUS", "revendedoras-get");
  if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  const vista = req.nextUrl.searchParams.get("vista");
  try {
    if (vista === "precios") return NextResponse.json(await RevendedorasDB.precios(auth.tenantId));
    if (vista === "candidatas") {
      const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 60);
      return NextResponse.json({ candidatas: await RevendedorasDB.candidatas(auth.tenantId, q) });
    }
    const [config, lista, categorias] = await Promise.all([
      RevendedorasDB.config(auth.tenantId),
      RevendedorasDB.listar(auth.tenantId),
      RevendedorasDB.categorias(auth.tenantId),
    ]);
    return NextResponse.json({ config, porDefecto: CONFIG_REVENDEDORAS_POR_DEFECTO, categorias, ...lista });
  } catch (e) {
    logger.error(`[${SERVICIO}] GET`, { err: errorDe(e), vista });
    return NextResponse.json({ error: "No se pudo leer" }, { status: 503 });
  }
}

export async function PUT(req: NextRequest) {
  const _rl = applyRateLimit(req, "MODERATE", "revendedoras-config");
  if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const parsed = ConfigRevendedorasSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
  }
  const config = parsed.data;
  try {
    await RevendedorasDB.guardarConfig(auth.tenantId, config);
    const niveles = config.niveles.map((n) => `${n.descuento} % desde S/ ${n.desde}`).join(" · ");
    void logActivity(
      "update",
      "settings",
      `Revendedoras ${config.activo ? "activas" : "apagadas"}: ${niveles} · mínimo S/ ${config.pedidoMinimo} · ganancia mínima ${config.margenMinimo} %`,
      "revendedoras",
      auth.username,
      undefined,
      auth.tenantId,
    ).catch((err) => logger.warn(`[${SERVICIO}] activity`, { err: String(err) }));
    return NextResponse.json({ config });
  } catch (e) {
    logger.error(`[${SERVICIO}] PUT`, { err: errorDe(e) });
    return NextResponse.json({ error: "No se pudo guardar" }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const parsed = PostSchema.safeParse(await req.json().catch(() => null));
  // La vista previa del pedido se pide al tipear cantidades: balde propio y generoso.
  const cotiza = parsed.success && parsed.data.accion === "cotizar";
  const _rl = applyRateLimit(req, cotiza ? "GENEROUS" : "MODERATE", cotiza ? "revendedoras-cotizar" : "revendedoras-marcar");
  if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
  }
  const body = parsed.data;
  try {
    if (body.accion === "cotizar") {
      const r = await RevendedorasDB.cotizar(auth.tenantId, { customerId: body.customerId, items: body.items });
      if (r === "no-es-revendedora") return NextResponse.json({ error: "Esa clienta no es revendedora." }, { status: 404 });
      return NextResponse.json(r);
    }
    if (body.accion === "marcar") {
      const r = await RevendedorasDB.marcar(auth.tenantId, body.customerId, limaDateKey());
      if (r === "no-existe") return NextResponse.json({ error: "No existe esa clienta." }, { status: 404 });
      if (r === "marcada") {
        invalidateAdminCache.afterCustomer(auth.tenantId);
        void logActivity("update", "customer", "Ahora es revendedora", body.customerId, auth.username, undefined, auth.tenantId)
          .catch((err) => logger.warn(`[${SERVICIO}] activity`, { err: String(err) }));
      }
      return NextResponse.json({ ok: true, estado: r });
    }
    const ok = await RevendedorasDB.quitar(auth.tenantId, body.customerId);
    if (!ok) return NextResponse.json({ error: "Esa clienta no es revendedora." }, { status: 404 });
    invalidateAdminCache.afterCustomer(auth.tenantId);
    void logActivity("update", "customer", "Ya no es revendedora (vuelve a precio general)", body.customerId, auth.username, undefined, auth.tenantId)
      .catch((err) => logger.warn(`[${SERVICIO}] activity`, { err: String(err) }));
    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error(`[${SERVICIO}] POST`, { err: errorDe(e), accion: body.accion });
    return NextResponse.json({ error: "No se pudo guardar" }, { status: 503 });
  }
}
