import "server-only";
/**
 * lib/db/semaforo.db.ts — cifras del Semáforo del negocio (ADR-508). SÓLO LECTURA.
 *
 * Una consulta por grupo de indicadores (ventas, gastos, clientes, stock,
 * mermas, sin rotar), todas en paralelo: ~1 ida a Supabase de pared. La regla
 * de ventas es la de Mi Plata: mostrador (`Sale`) + pedidos no borrados en un
 * estado que ya es ingreso; costo = `totalCogs`, y sin costo anotado se estima
 * al 55 % (`COSTO_ESTIMADO_PCT`); gastos = `Expense` no recurrentes por su día.
 *
 * Timestamps sin zona (guardan UTC): las ventanas van como instantes
 * `[00:00 Lima, 00:00 Lima del día siguiente)`; `Expense.date` y `expiresAt`
 * pueden ser «sólo día» (medianoche UTC) y pasan por `diaLima()`.
 *
 * Caché 120 s por tenant y período: lo escriben OTROS módulos (POS, pedidos,
 * gastos), así que no hay invalidate en su write; «Volver a medir» (?fresco=1)
 * borra `semaforo:${tenantId}:`. La config se lee de `featureFlagsJson.semaforo`.
 */
import { prisma } from "@/lib/prisma";
import { getOrSet, invalidateByPrefix } from "@/lib/cache";
import { SettingsDB } from "@/lib/db/settings.db";
import { ESTADOS_PEDIDO_QUE_ENTRAN } from "@/lib/finance/ingresos-del-periodo";
import { COSTO_ESTIMADO_PCT } from "@/lib/finance/resultado-del-negocio";
import { limaDayRange } from "@/lib/utils";
import { sumarDias } from "@/lib/agenda/recurrencia";
import {
  configDeFlags,
  guardadaDeFlags,
  mezclarConfig,
  type ConfigSemaforo,
  type ConfigSemaforoGuardada,
} from "@/lib/semaforo/config";
import { armarIndicadores, ventanaRecompra, type CifrasSemaforo, type IndicadorDTO } from "@/lib/semaforo/evaluar";

const TTL = 120;
const DIAS_SIN_ROTAR = 60;
const ESTADOS = [...ESTADOS_PEDIDO_QUE_ENTRAN] as string[];

function exigirTenant(tenantId: string): void {
  if (!tenantId) throw new Error("tenantId is required");
}

/** Día de Lima de una columna que puede ser «sólo día» (medianoche UTC) o instante. `col` = identificador fijo. */
function diaLima(col: string): string {
  return `CASE WHEN ${col}::time = '00:00' THEN to_char(${col}, 'YYYY-MM-DD') ELSE to_char(${col} - interval '5 hours', 'YYYY-MM-DD') END`;
}

/** `[desde 00:00 Lima, hasta+1 00:00 Lima)` como texto ISO para `$n::timestamp` (la zona se ignora: la columna guarda UTC). */
function instantes(desde: string, hasta: string): [string, string] {
  return [limaDayRange(desde).start.toISOString(), limaDayRange(hasta).end.toISOString()];
}

interface FilaVentas { n: number; ventas: number; costo: number; sin_costo: number }

async function ventasDelRango(tenantId: string, desde: string, hasta: string): Promise<{ pedidos: number; ventas: number; costo: number; costoEstimado: number }> {
  const [gte, lt] = instantes(desde, hasta);
  const [f] = await prisma.$queryRawUnsafe<FilaVentas[]>(
    `SELECT count(*)::int AS n, COALESCE(sum(total), 0)::float8 AS ventas,
            COALESCE(sum(cogs), 0)::float8 AS costo,
            COALESCE(sum(total) FILTER (WHERE cogs IS NULL), 0)::float8 AS sin_costo
       FROM (
         SELECT s.total, s."totalCogs" AS cogs FROM "Sale" s
          WHERE s."tenantId" = $1 AND s."createdAt" >= $2::timestamp AND s."createdAt" < $3::timestamp
         UNION ALL
         SELECT o.total, o."totalCogs" FROM "Order" o
          WHERE o."tenantId" = $1 AND o."deletedAt" IS NULL AND o.status::text = ANY($4::text[])
            AND o."createdAt" >= $2::timestamp AND o."createdAt" < $3::timestamp
       ) x`,
    tenantId,
    gte,
    lt,
    ESTADOS,
  );
  const costoEstimado = (f?.sin_costo ?? 0) * COSTO_ESTIMADO_PCT;
  return { pedidos: f?.n ?? 0, ventas: f?.ventas ?? 0, costo: (f?.costo ?? 0) + costoEstimado, costoEstimado };
}

async function gastosDelRango(tenantId: string, desde: string, hasta: string, categorias: string[]): Promise<{ gastos: number; anuncios: number }> {
  const [f] = await prisma.$queryRawUnsafe<Array<{ gastos: number; anuncios: number }>>(
    `SELECT COALESCE(sum(e.amount), 0)::float8 AS gastos,
            COALESCE(sum(e.amount) FILTER (WHERE lower(e.category) = ANY($4::text[])), 0)::float8 AS anuncios
       FROM "Expense" e
      WHERE e."tenantId" = $1 AND e.recurring = false
        AND e.date >= (($2::text)::date - 1) AND e.date < (($3::text)::date + 2)
        AND ${diaLima(`e.date`)} BETWEEN $2::text AND $3::text`,
    tenantId,
    desde,
    hasta,
    categorias,
  );
  return { gastos: f?.gastos ?? 0, anuncios: f?.anuncios ?? 0 };
}

/** Clientes por celular: nuevos del período (1.ª compra) y cuántos compraron en 2+ días desde `desdeRecompra`. */
async function clientes(
  tenantId: string,
  desde: string,
  hasta: string,
  desdeRecompra: string,
): Promise<{ nuevos: number; clientes: number; volvieron: number }> {
  const [f] = await prisma.$queryRawUnsafe<Array<{ nuevos: number; clientes: number; volvieron: number }>>(
    `WITH compras AS (
       SELECT s."customerPhone" AS tel, to_char(s."createdAt" - interval '5 hours', 'YYYY-MM-DD') AS dia
         FROM "Sale" s WHERE s."tenantId" = $1 AND COALESCE(s."customerPhone", '') <> ''
       UNION ALL
       SELECT o."customerPhone", to_char(o."createdAt" - interval '5 hours', 'YYYY-MM-DD')
         FROM "Order" o
        WHERE o."tenantId" = $1 AND o."deletedAt" IS NULL AND o.status::text = ANY($5::text[])
          AND COALESCE(o."customerPhone", '') <> ''
     ), por_tel AS (
       SELECT tel, min(dia) AS primera,
              count(DISTINCT dia) FILTER (WHERE dia BETWEEN $4::text AND $3::text) AS dias_ventana
         FROM compras WHERE dia <= $3::text GROUP BY tel
     )
     SELECT count(*) FILTER (WHERE primera BETWEEN $2::text AND $3::text)::int AS nuevos,
            count(*) FILTER (WHERE dias_ventana >= 1)::int AS clientes,
            count(*) FILTER (WHERE dias_ventana >= 2)::int AS volvieron
       FROM por_tel`,
    tenantId,
    desde,
    hasta,
    desdeRecompra,
    ESTADOS,
  );
  return { nuevos: f?.nuevos ?? 0, clientes: f?.clientes ?? 0, volvieron: f?.volvieron ?? 0 };
}

interface FilaStock {
  a_con_stock: number;
  a_agotados: number;
  a_nombres: string[] | null;
  valor_costo: number;
  con_stock: number;
  vencidos_en_stock: number;
}

/** Foto de HOY del inventario: productos A agotados, stock a costo y vencidos que siguen en el estante. */
async function stock(tenantId: string, codigosA: string[], hoy: string): Promise<FilaStock> {
  const [f] = await prisma.$queryRawUnsafe<FilaStock[]>(
    `SELECT count(*) FILTER (WHERE es_a AND stock IS NOT NULL)::int AS a_con_stock,
            count(*) FILTER (WHERE es_a AND stock IS NOT NULL AND stock <= 0)::int AS a_agotados,
            (array_agg(name ORDER BY name) FILTER (WHERE es_a AND stock IS NOT NULL AND stock <= 0))[1:5] AS a_nombres,
            COALESCE(sum(stock * "costPrice") FILTER (WHERE stock > 0 AND "costPrice" IS NOT NULL), 0)::float8 AS valor_costo,
            count(*) FILTER (WHERE stock > 0)::int AS con_stock,
            COALESCE(sum(stock) FILTER (WHERE stock > 0 AND vence IS NOT NULL AND vence < $3::text), 0)::int AS vencidos_en_stock
       FROM (
         SELECT p.name, p.stock, p."costPrice",
                CASE WHEN p."expiresAt" IS NULL THEN NULL ELSE ${diaLima(`p."expiresAt"`)} END AS vence,
                CASE WHEN cardinality($2::text[]) > 0 THEN (p.barcode = ANY($2::text[]) OR p.sku = ANY($2::text[]))
                     ELSE COALESCE(p."stockMin", 0) > 0 END AS es_a
           FROM "Product" p
          WHERE p."tenantId" = $1 AND p."deletedAt" IS NULL AND p.active = true AND p.type <> 'service'
       ) x`,
    tenantId,
    codigosA,
    hoy,
  );
  return f ?? { a_con_stock: 0, a_agotados: 0, a_nombres: null, valor_costo: 0, con_stock: 0, vencidos_en_stock: 0 };
}

async function mermas(tenantId: string, desde: string, hasta: string): Promise<number> {
  const [gte, lt] = instantes(desde, hasta);
  const [f] = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
    `SELECT COALESCE(sum(abs(quantity)), 0)::int AS n FROM "InventoryMovement"
      WHERE "tenantId" = $1 AND type = 'merma' AND COALESCE("lossType", '') NOT IN ('theft', 'obsolescence')
        AND "createdAt" >= $2::timestamp AND "createdAt" < $3::timestamp`,
    tenantId,
    gte,
    lt,
  );
  return f?.n ?? 0;
}

/** Con stock y menos de 2 unidades vendidas en 60 días; los que entraron hace menos de 60 no cuentan. */
async function sinRotar(tenantId: string, hasta: string): Promise<{ n: number; nombres: string[] }> {
  const [gte, lt] = instantes(sumarDias(hasta, -(DIAS_SIN_ROTAR - 1)), hasta);
  const [f] = await prisma.$queryRawUnsafe<Array<{ n: number; nombres: string[] | null }>>(
    `WITH vendidos AS (
       SELECT si."productId" AS pid, si.quantity AS u
         FROM "SaleItem" si JOIN "Sale" s ON s.id = si."saleId"
        WHERE s."tenantId" = $1 AND s."createdAt" >= $2::timestamp AND s."createdAt" < $3::timestamp
       UNION ALL
       SELECT oi."productId", oi.quantity
         FROM "OrderItem" oi JOIN "Order" o ON o.id = oi."orderId"
        WHERE o."tenantId" = $1 AND o."deletedAt" IS NULL AND o.status::text = ANY($4::text[])
          AND o."createdAt" >= $2::timestamp AND o."createdAt" < $3::timestamp AND oi."productId" IS NOT NULL
     ), por_producto AS (SELECT pid, sum(u) AS u FROM vendidos GROUP BY pid),
     entrada AS (
       SELECT m."productId" AS pid, min(m."createdAt") AS primera
         FROM "InventoryMovement" m WHERE m."tenantId" = $1 GROUP BY m."productId"
     )
     SELECT count(*)::int AS n, (array_agg(p.name ORDER BY p.name))[1:5] AS nombres
       FROM "Product" p
       LEFT JOIN por_producto v ON v.pid = p.id
       LEFT JOIN entrada e ON e.pid = p.id
      WHERE p."tenantId" = $1 AND p."deletedAt" IS NULL AND p.active = true AND p.type <> 'service'
        AND p.stock > 0 AND COALESCE(v.u, 0) < 2
        AND (e.primera IS NULL OR e.primera < $2::timestamp)`,
    tenantId,
    gte,
    lt,
    ESTADOS,
  );
  return { n: f?.n ?? 0, nombres: f?.nombres ?? [] };
}

export interface SemaforoDTO {
  desde: string;
  hasta: string;
  hoy: string;
  /** El período termina antes del lanzamiento: lo que hay son datos de prueba. */
  antesDelLanzamiento: boolean;
  lanzamiento: string | null;
  indicadores: IndicadorDTO[];
  /** La config guardada no pasó el schema: se ven los valores por defecto. */
  configInvalida: boolean;
  medidoEn: string;
}

export const SemaforoDB = {
  async config(tenantId: string): Promise<ConfigSemaforo> {
    exigirTenant(tenantId);
    return configDeFlags(await SettingsDB.getFeatureFlags(tenantId));
  },

  /** Lo guardado tal cual (sin los defectos): el modal de ajustes edita esto. */
  async configGuardada(tenantId: string): Promise<ConfigSemaforoGuardada> {
    exigirTenant(tenantId);
    return guardadaDeFlags(await SettingsDB.getFeatureFlags(tenantId));
  },

  async cifras(tenantId: string, cfg: ConfigSemaforo, desde: string, hasta: string, hoy: string): Promise<CifrasSemaforo> {
    exigirTenant(tenantId);
    const desdeRecompra = ventanaRecompra(hasta, cfg.lanzamiento);
    const conAcumulado = cfg.lanzamiento !== null && cfg.lanzamiento <= hasta;
    const mismoRango = conAcumulado && cfg.lanzamiento === desde;
    const [v, g, cl, st, me, sr, acV, acG] = await Promise.all([
      ventasDelRango(tenantId, desde, hasta),
      gastosDelRango(tenantId, desde, hasta, cfg.categoriasAnuncios),
      clientes(tenantId, desde, hasta, desdeRecompra),
      stock(tenantId, cfg.productosA, hoy),
      mermas(tenantId, desde, hasta),
      sinRotar(tenantId, hasta),
      conAcumulado && !mismoRango && cfg.lanzamiento ? ventasDelRango(tenantId, cfg.lanzamiento, hasta) : Promise.resolve(null),
      conAcumulado && !mismoRango && cfg.lanzamiento ? gastosDelRango(tenantId, cfg.lanzamiento, hasta, cfg.categoriasAnuncios) : Promise.resolve(null),
    ]);
    const acumVentas = mismoRango ? v : acV;
    const acumGastos = mismoRango ? g : acG;
    return {
      pedidos: v.pedidos,
      ventas: v.ventas,
      costo: v.costo,
      costoEstimado: v.costoEstimado,
      gastos: g.gastos,
      anuncios: g.anuncios,
      clientesNuevos: cl.nuevos,
      recompra: { clientes: cl.clientes, volvieron: cl.volvieron, desde: desdeRecompra },
      productosA: { conStock: st.a_con_stock, agotados: st.a_agotados, nombres: st.a_nombres ?? [] },
      vencidosDanados: me + st.vencidos_en_stock,
      stock: { valorCosto: st.valor_costo, productosConStock: st.con_stock },
      sinRotar: sr,
      acumulado:
        conAcumulado && acumVentas && acumGastos
          ? { ventas: acumVentas.ventas, costo: acumVentas.costo, gastos: acumGastos.gastos }
          : null,
    };
  },

  /** El semáforo armado para un período `[desde, hasta]` (días de Lima). */
  async semaforo(tenantId: string, desde: string, hasta: string, hoy: string): Promise<SemaforoDTO> {
    exigirTenant(tenantId);
    const cfg = await SemaforoDB.config(tenantId);
    // La config entra en la clave: guardar umbrales nuevos no espera a que venza la caché.
    const firma = JSON.stringify([cfg.lanzamiento, cfg.productosA, cfg.categoriasAnuncios]);
    const cifras = await getOrSet(`semaforo:${tenantId}:${desde}:${hasta}:${firma}`, TTL, () =>
      SemaforoDB.cifras(tenantId, cfg, desde, hasta, hoy),
    );
    return {
      desde,
      hasta,
      hoy,
      antesDelLanzamiento: cfg.lanzamiento !== null && hasta < cfg.lanzamiento,
      lanzamiento: cfg.lanzamiento,
      indicadores: armarIndicadores(cifras, cfg, { desde, hasta, hoy }),
      configInvalida: cfg.invalida,
      medidoEn: new Date().toISOString(),
    };
  },

  /** Guarda un cambio de config mezclado con lo que había (por indicador). Devuelve lo guardado. */
  async guardarConfig(tenantId: string, cambio: ConfigSemaforoGuardada): Promise<ConfigSemaforoGuardada> {
    exigirTenant(tenantId);
    const actual = await SemaforoDB.configGuardada(tenantId);
    const mezcla = mezclarConfig(actual, cambio);
    // Sólo las claves que cambiaron, una sentencia: lo que otro guardó en el medio queda.
    const subclaves: Record<string, unknown> = { version: 1 };
    for (const k of Object.keys(cambio) as Array<keyof ConfigSemaforoGuardada>) subclaves[k] = mezcla[k] ?? null;
    await SettingsDB.pisarSubclavesFlags(tenantId, "semaforo", subclaves);
    SemaforoDB.olvidar(tenantId);
    return mezcla;
  },

  olvidar(tenantId: string): void {
    exigirTenant(tenantId);
    invalidateByPrefix(`semaforo:${tenantId}:`);
  },
};
