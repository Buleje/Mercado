import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import type { SondaAislamiento } from "@/lib/superadmin/health-negocios";

/**
 * HealthDB
 *
 * Audit project-wide 2026-05-19 — sonda de liveness para /api/health.
 * 04-11 (noche autónoma, carril «salud») — también la casa de las lecturas globales del
 * superadmin `/api/superadmin/health` y `/health/metrics` (antes `prisma.*` directo en las rutas).
 *
 * No tiene tenantId porque son probes de infraestructura / integridad de TODA la plataforma,
 * no de datos de un negocio (la lectura de uso de UN negocio vive en `SaludNegocioDB`). Todo es
 * SÓLO LECTURA y el SQL va con plantillas etiquetadas (`$queryRaw`), nunca `$queryRawUnsafe`.
 * Cada falla se registra con `logger.error`: nada se traga en silencio.
 */

type FilaConteo = Array<{ count: bigint }>;
type FilaPorNegocio = Array<{ tenantId: string; _count: { _all: number } }>;

export interface ConteosPorNegocio {
  productos: Map<string, number>;
  pedidos: Map<string, number>;
  clientes: Map<string, number>;
  pedidos24h: Map<string, number>;
  itemsCruzados: Map<string, number>;
}

export interface MetricasMotor {
  latencyMs: number | null;
  connections: { total: number; active: number; idle: number } | null;
  sizeBytes: number | null;
  cacheHitRatio: number | null;
  commits?: number;
  rollbacks?: number;
  topTables: Array<{ name: string; bytes: number }> | null;
}

export interface ResumenPlataforma {
  total: number;
  active: number;
  published: number;
  ordersToday: number;
  products: number;
}

const aMapa = (filas: FilaPorNegocio) => new Map(filas.map((r) => [r.tenantId, r._count._all]));
const primero = (f: FilaConteo) => Number(f[0]?.count ?? 0);

/** Corre una métrica; si falla, la registra y devuelve null («no disponible», nunca un valor falso). */
async function medir<T>(nombre: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    logger.error(`[health] métrica ${nombre} falló`, { error: String(err) });
    return null;
  }
}

export const HealthDB = {
  /**
   * Ejecuta `SELECT 1` para verificar conectividad a la base de datos.
   * Lanza excepción si la conexión falla — el caller la captura.
   */
  async ping(): Promise<void> {
    await prisma.$queryRaw`SELECT 1`;
  },

  // ── Integridad entre negocios (/api/superadmin/health) ──────────────────────

  /** Las 5 sondas de aislamiento, cada una en su consulta. null = esa consulta falló (queda registrada). */
  async sondasDeAislamiento(): Promise<Record<SondaAislamiento, number | null>> {
    const consultas: Record<SondaAislamiento, () => Promise<FilaConteo>> = {
      pedidosHuerfanos: () => prisma.$queryRaw<FilaConteo>`
        SELECT COUNT(*) as count FROM "Order" o
        WHERE NOT EXISTS (SELECT 1 FROM "Tenant" t WHERE t.id = o."tenantId")`,
      productosHuerfanos: () => prisma.$queryRaw<FilaConteo>`
        SELECT COUNT(*) as count FROM "Product" p
        WHERE NOT EXISTS (SELECT 1 FROM "Tenant" t WHERE t.id = p."tenantId")`,
      clientesHuerfanos: () => prisma.$queryRaw<FilaConteo>`
        SELECT COUNT(*) as count FROM "Customer" c
        WHERE NOT EXISTS (SELECT 1 FROM "Tenant" t WHERE t.id = c."tenantId")`,
      itemsCruzados: () => prisma.$queryRaw<FilaConteo>`
        SELECT COUNT(*) as count FROM "OrderItem" oi
        JOIN "Order" o ON o.id = oi."orderId"
        JOIN "Product" p ON p.id = oi."productId"
        WHERE o."tenantId" != p."tenantId"`,
      adminsHuerfanos: () => prisma.$queryRaw<FilaConteo>`
        SELECT COUNT(*) as count FROM "AdminUser" u
        WHERE NOT EXISTS (SELECT 1 FROM "Tenant" t WHERE t.id = u."tenantId")`,
    };
    const claves = Object.keys(consultas) as SondaAislamiento[];
    const resultados = await Promise.all(
      claves.map((k) => medir(`sonda ${k}`, async () => primero(await consultas[k]()))),
    );
    return Object.fromEntries(claves.map((k, i) => [k, resultados[i]])) as Record<SondaAislamiento, number | null>;
  },

  /** Todos los negocios (id, slug, nombre) por nombre. */
  async listarNegocios() {
    return prisma.tenant.findMany({
      select: { id: true, slug: true, name: true },
      orderBy: { name: "asc" },
    });
  },

  /**
   * Conteos de todos los negocios en 6 consultas (no N+1): productos, pedidos, clientes, pedidos desde
   * `desde24h` e items cruzados. Indexados por `Tenant.id`. Una consulta caída cuenta 0 (y queda en el log).
   */
  async conteosPorNegocio(desde24h: Date): Promise<ConteosPorNegocio> {
    const [productos, pedidos, clientes, pedidos24h, cruzados] = await Promise.all([
      prisma.product.groupBy({ by: ["tenantId"], _count: { _all: true } }).catch((err) => {
        logger.error("[health] conteo de productos por negocio falló", { error: String(err) });
        return [];
      }),
      prisma.order.groupBy({ by: ["tenantId"], _count: { _all: true } }).catch((err) => {
        logger.error("[health] conteo de pedidos por negocio falló", { error: String(err) });
        return [];
      }),
      prisma.customer.groupBy({ by: ["tenantId"], _count: { _all: true } }).catch((err) => {
        logger.error("[health] conteo de clientes por negocio falló", { error: String(err) });
        return [];
      }),
      prisma.order
        .groupBy({ by: ["tenantId"], where: { createdAt: { gte: desde24h } }, _count: { _all: true } })
        .catch((err) => {
          logger.error("[health] conteo de pedidos 24h por negocio falló", { error: String(err) });
          return [];
        }),
      prisma.$queryRaw<Array<{ tenantId: string; count: bigint }>>`
        SELECT o."tenantId" as "tenantId", COUNT(*) as count
        FROM "OrderItem" oi
        JOIN "Order" o ON o.id = oi."orderId"
        JOIN "Product" p ON p.id = oi."productId"
        WHERE o."tenantId" != p."tenantId"
        GROUP BY o."tenantId"`.catch((err): Array<{ tenantId: string; count: bigint }> => {
        logger.error("[health] items cruzados por negocio falló", { error: String(err) });
        return [];
      }),
    ]);
    return {
      productos: aMapa(productos),
      pedidos: aMapa(pedidos),
      clientes: aMapa(clientes),
      pedidos24h: aMapa(pedidos24h),
      itemsCruzados: new Map(cruzados.map((r) => [r.tenantId, Number(r.count)])),
    };
  },

  // ── Métricas del motor y de la plataforma (/api/superadmin/health/metrics) ──

  /**
   * Latencia, conexiones, tamaño, caché y tablas más grandes de Postgres. Cada una va aparte:
   * si una falla queda null (o ausente) y el resto sigue. La latencia se cronometra SOLA primero
   * para que las otras consultas no le sumen espera.
   */
  async metricasDelMotor(): Promise<MetricasMotor> {
    const latencyMs = await medir("latencia", async () => {
      const t0 = performance.now();
      await prisma.$queryRaw`SELECT 1`;
      return Math.round((performance.now() - t0) * 10) / 10;
    });

    const [connections, sizeBytes, trafico, topTables] = await Promise.all([
      medir("conexiones", async () => {
        const rows = await prisma.$queryRaw<Array<{ state: string | null; n: bigint }>>`
          SELECT state, count(*)::bigint AS n FROM pg_stat_activity
          WHERE datname = current_database() GROUP BY state`;
        let total = 0, active = 0, idle = 0;
        for (const r of rows) {
          const n = Number(r.n);
          total += n;
          if (r.state === "active") active += n;
          else if (r.state === "idle") idle += n;
        }
        return { total, active, idle };
      }),
      medir("tamaño", async () => {
        const r = await prisma.$queryRaw<Array<{ bytes: bigint }>>`
          SELECT pg_database_size(current_database())::bigint AS bytes`;
        return Number(r[0]?.bytes ?? 0);
      }),
      medir("caché y transacciones", async () => {
        const r = await prisma.$queryRaw<Array<{ hit: bigint; rd: bigint; commits: bigint; rollbacks: bigint }>>`
          SELECT COALESCE(sum(blks_hit),0)::bigint AS hit, COALESCE(sum(blks_read),0)::bigint AS rd,
                 COALESCE(sum(xact_commit),0)::bigint AS commits, COALESCE(sum(xact_rollback),0)::bigint AS rollbacks
          FROM pg_stat_database WHERE datname = current_database()`;
        const hit = Number(r[0]?.hit ?? 0), rd = Number(r[0]?.rd ?? 0);
        return {
          cacheHitRatio: hit + rd > 0 ? Math.round((hit / (hit + rd)) * 1000) / 10 : null,
          commits: Number(r[0]?.commits ?? 0),
          rollbacks: Number(r[0]?.rollbacks ?? 0),
        };
      }),
      medir("tablas más grandes", async () => {
        const rows = await prisma.$queryRaw<Array<{ name: string; bytes: bigint }>>`
          SELECT relname AS name, pg_total_relation_size(relid)::bigint AS bytes
          FROM pg_stat_user_tables ORDER BY bytes DESC LIMIT 6`;
        return rows.map((r) => ({ name: r.name, bytes: Number(r.bytes) }));
      }),
    ]);

    return {
      latencyMs,
      connections,
      sizeBytes,
      cacheHitRatio: trafico?.cacheHitRatio ?? null,
      ...(trafico ? { commits: trafico.commits, rollbacks: trafico.rollbacks } : {}),
      topTables,
    };
  },

  /** Rollup de la plataforma: negocios (total/activos), tiendas publicadas, pedidos desde `desdeHoy` y productos. Lanza si falla. */
  async resumenPlataforma(desdeHoy: Date): Promise<ResumenPlataforma> {
    const [total, active, published, ordersToday, products] = await Promise.all([
      prisma.tenant.count(),
      prisma.tenant.count({ where: { active: true } }),
      prisma.store.count({ where: { isPublished: true } }),
      prisma.order.count({ where: { createdAt: { gte: desdeHoy } } }),
      prisma.product.count(),
    ]);
    return { total, active, published, ordersToday, products };
  },
};
