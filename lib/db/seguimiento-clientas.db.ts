import "server-only";
/**
 * SeguimientoClientasDB (ADR-508) — la última compra de cada cliente con celular,
 * para escribirle a los 3, 15 y 30 días. UNA consulta agrupada: ventas del
 * mostrador + pedidos que entran (los mismos estados que Mi Plata), la última
 * por celular con `DISTINCT ON`, el nombre (del pedido o de la ficha del
 * cliente DE ESTE negocio) y el producto con más unidades.
 *
 * Sólo lectura, con caché corta (la vacía «Actualizar» de la agenda).
 */
import { prisma } from "@/lib/prisma";
import { getOrSet, invalidateByPrefix } from "@/lib/cache";
import { SettingsDB } from "@/lib/db/settings.db";
import { ESTADOS_PEDIDO_QUE_ENTRAN } from "@/lib/finance/ingresos-del-periodo";
import { limaDayRange } from "@/lib/utils";
import { sumarDias } from "@/lib/agenda/recurrencia";
import {
  armarSeguimientos,
  configSeguimientoDeFlags,
  type SeguimientoClienta,
  type UltimaCompra,
} from "@/lib/agenda/seguimiento-clientas";
import type { FechaKey } from "@/lib/agenda/tipos";

const ESTADOS = [...ESTADOS_PEDIDO_QUE_ENTRAN] as string[];
const TTL_S = 300;

function exigirTenant(tenantId: string): void {
  if (!tenantId) throw new Error("tenantId is required");
}

interface Fila {
  tel: string;
  dia: string;
  nombre: string | null;
  producto: string | null;
}

/** Última compra por celular entre `[desde 00:00 Lima, ahora)`. */
async function ultimasCompras(tenantId: string, desde: FechaKey): Promise<UltimaCompra[]> {
  const filas = await prisma.$queryRawUnsafe<Fila[]>(
    `WITH compras AS (
       SELECT s."customerPhone" AS tel, s."createdAt" AS en, 'venta'::text AS tipo, s.id AS ref, NULL::text AS nombre
         FROM "Sale" s
        WHERE s."tenantId" = $1 AND s."createdAt" >= $2::timestamp AND COALESCE(s."customerPhone", '') <> ''
       UNION ALL
       SELECT o."customerPhone", o."createdAt", 'pedido', o.id, NULLIF(trim(o."customerName"), '')
         FROM "Order" o
        WHERE o."tenantId" = $1 AND o."deletedAt" IS NULL AND o.status::text = ANY($3::text[])
          AND o."createdAt" >= $2::timestamp AND COALESCE(o."customerPhone", '') <> ''
     ), ultima AS (
       SELECT DISTINCT ON (tel) tel, en, tipo, ref, nombre FROM compras ORDER BY tel, en DESC
     )
     SELECT u.tel, to_char(u.en - interval '5 hours', 'YYYY-MM-DD') AS dia,
            COALESCE(u.nombre, NULLIF(trim(c.name), '')) AS nombre, p.producto
       FROM ultima u
       LEFT JOIN "Customer" c ON c.phone = u.tel AND c."tenantId" = $1
       LEFT JOIN LATERAL (
         SELECT x.name AS producto FROM (
           SELECT si.name, si.quantity FROM "SaleItem" si WHERE u.tipo = 'venta' AND si."saleId" = u.ref
           UNION ALL
           SELECT oi.name, oi.quantity FROM "OrderItem" oi WHERE u.tipo = 'pedido' AND oi."orderId" = u.ref
         ) x ORDER BY x.quantity DESC, x.name LIMIT 1
       ) p ON true`,
    tenantId,
    limaDayRange(desde).start.toISOString(),
    ESTADOS,
  );
  return filas.map((f) => ({ telefono: f.tel, dia: f.dia, nombre: f.nombre, producto: f.producto }));
}

export const SeguimientoClientasDB = {
  /**
   * A quién escribirle en cada día de `[desde, hasta]` (se recorta a partir de hoy:
   * un seguimiento de un día que ya pasó no se puede hacer). La última compra
   * manda: si volvió a comprar, el reloj arranca de nuevo.
   */
  async delRango(tenantId: string, desde: FechaKey, hasta: FechaKey, hoy: FechaKey): Promise<SeguimientoClienta[]> {
    exigirTenant(tenantId);
    const inicio = desde < hoy ? hoy : desde;
    if (inicio > hasta) return [];
    const cfg = configSeguimientoDeFlags(await SettingsDB.getFeatureFlags(tenantId));
    if (!cfg.activo) return [];
    const ventana = sumarDias(inicio, -Math.max(...cfg.dias));
    // La caché guarda sólo las compras (los mensajes se arman cada vez): la clave es la ventana.
    const compras = await getOrSet(`seguimiento:${tenantId}:${ventana}`, TTL_S, () => ultimasCompras(tenantId, ventana));
    return armarSeguimientos(compras, cfg, inicio, hasta);
  },

  olvidar(tenantId: string): void {
    exigirTenant(tenantId);
    invalidateByPrefix(`seguimiento:${tenantId}:`);
  },
};
