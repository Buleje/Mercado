/**
 * GET /api/admin/comprobantes/lista — Facturas y boletas con período, búsqueda
 * global y filtros (F34/F36/F38).
 *
 * Query: `desde`/`hasta` (días de Lima), `q` (serie-número, cliente, RUC,
 * #pedido, importe o estado), `tipo` y `estado` (separados por coma), `origen`
 * (pedido | sin-pedido), `limite` (≤ 2000, por defecto 200).
 * → `{ data, total, resumen }`: `resumen` sale del MISMO filtro que `data`,
 * contado en la base (antes las cifras eran de los 100 que traía la lista).
 *
 * Sólo lectura. Mismos roles que `/api/admin/sunat/invoices` (el cajero ve los
 * comprobantes de su turno).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { ComprobantesSeguimientoDB } from "@/lib/db/comprobantes-seguimiento.db";
import { rangoDeParams } from "@/lib/comprobantes/periodo";
import { interpretarBusqueda } from "@/lib/comprobantes/busqueda";

const ROLES = ["admin", "cajero"] as const;
const TIPOS = ["boleta", "factura", "nota_credito", "baja"] as const;
const ESTADOS = ["pending", "retrying", "accepted", "rejected", "voided"] as const;

const csv = <T extends string>(valores: readonly [T, ...T[]]) =>
  z
    .string()
    .max(120)
    .optional()
    .transform((s) => (s ? s.split(",").map((x) => x.trim()).filter(Boolean) : []))
    .pipe(z.array(z.enum(valores)).max(valores.length));

const ParamsSchema = z.object({
  q: z.string().max(80).optional(),
  tipo: csv(TIPOS),
  estado: csv(ESTADOS),
  origen: z.enum(["pedido", "sin-pedido"]).optional(),
  limite: z.coerce.number().int().min(1).max(2000).optional(),
});

export async function GET(req: NextRequest) {
  const rl = applyRateLimit(req, "MODERATE", "comprobantes-lista");
  if (rl) return rl;
  const auth = await requireAdmin(req, ROLES);
  if (auth instanceof NextResponse) return auth;

  const sp = req.nextUrl.searchParams;
  const rango = rangoDeParams(sp);
  const parsed = ParamsSchema.safeParse({
    q: sp.get("q") ?? undefined,
    tipo: sp.get("tipo") ?? undefined,
    estado: sp.get("estado") ?? undefined,
    origen: sp.get("origen") ?? undefined,
    limite: sp.get("limite") ?? undefined,
  });
  if (!rango || !parsed.success) {
    return NextResponse.json({ error: "Filtros inválidos: revisa las fechas, el tipo o el estado." }, { status: 400 });
  }
  try {
    const r = await ComprobantesSeguimientoDB.listar(auth.tenantId, {
      rango,
      busqueda: interpretarBusqueda(parsed.data.q),
      tipos: parsed.data.tipo,
      estados: parsed.data.estado,
      origen: parsed.data.origen ?? null,
      limite: parsed.data.limite ?? 200,
    });
    return NextResponse.json(r, { headers: { "X-Total-Count": String(r.total) } });
  } catch (e) {
    logger.error("[comprobantes] lista GET", { err: e instanceof Error ? e.message : String(e), tenantId: auth.tenantId });
    return NextResponse.json({ error: "No se pudo traer los comprobantes" }, { status: 503 });
  }
}
