import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * lib/db/salud-negocio.db.ts — señales REALES de uso de un negocio (04-11, noche autónoma).
 *
 * El puntaje de salud (`lib/churn/health-scorer.ts`) buscaba los ingresos con otro
 * nombre (`entity "auth"`, `action "login"`, `entityId = tenant`) y siempre daba 0; sólo
 * sumaba pedidos (el aserradero no tiene) y contaba como «actividad» el respaldo diario.
 * Acá se cuenta lo que de verdad pasa, SÓLO LECTURA, siempre acotado por `tenantId`:
 *
 *  - ingresos      → `ActivityLog.action = 'login_success'` del negocio.
 *  - acciones      → lo que hicieron PERSONAS: sin `entity = 'System'` (respaldo diario),
 *                    sin `[L29733]…` (bitácora de cumplimiento) y sin usuarios máquina
 *                    (`system`, `cron`, `claude`, `script:*`, `agent:*`, `superadmin*`…).
 *  - módulos       → entidades distintas tocadas por personas en 30 d (sin el ingreso).
 *  - operaciones   → pedidos + ventas POS + líneas del libro CTP + ingresos de trozas.
 *
 * Raw SQL sólo con `$1 $2 $3…` (las listas de usuarios máquina van como parámetro). El filtro
 * «sólo personas» está escrito igual en las dos consultas de ActivityLog: si cambia, cambia en ambas.
 */

/** Usuarios que NO son una persona del negocio: máquinas, agentes y soporte de la plataforma. */
export const USUARIOS_MAQUINA = ["system", "cron", "claude", "superadmin", "Equipo Buleje"] as const;
/** Prefijos (LIKE) de usuarios máquina: scripts, agentes, impersonación del superadmin. */
export const PREFIJOS_MAQUINA = ["script:%", "script-%", "agent:%", "impersonated-by:%", "superadmin%"] as const;

export interface SenalesDeUso {
  /** Ingresos (`login_success`) de personas. */
  ingresos7d: number;
  ingresos30d: number;
  /** Fecha del último ingreso de una persona (sin límite de ventana); null = nunca. */
  ultimoIngreso: Date | null;
  /** Acciones de personas (sin ingresos ni ruido de sistema). */
  acciones7d: number;
  acciones30d: number;
  /** Entidades distintas (≈ módulos) que tocaron personas en 30 d. */
  modulos30d: number;
  /** Pedidos + ventas POS + líneas del libro CTP + ingresos de trozas. */
  operaciones7d: number;
  operaciones30d: number;
  /** Fecha de la última operación (sin límite de ventana); null = nunca. */
  ultimaOperacion: Date | null;
  /** Desglose de operaciones de 30 d, para el log y la ficha. */
  desglose30d: { pedidos: number; ventas: number; libroCtp: number; trozas: number };
}

interface FilaActividad {
  ingresos7d: number;
  ingresos30d: number;
  acciones7d: number;
  acciones30d: number;
  modulos30d: number;
}

interface FilaOperaciones {
  pedidos7d: number; pedidos30d: number; pedidosUlt: Date | null;
  ventas7d: number; ventas30d: number; ventasUlt: Date | null;
  libro7d: number; libro30d: number; libroUlt: Date | null;
  trozas7d: number; trozas30d: number; trozasUlt: Date | null;
}

const num = (v: unknown): number => {
  const n = typeof v === "bigint" ? Number(v) : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** La fecha más reciente de una lista (ignora los null). */
function masReciente(fechas: Array<Date | null>): Date | null {
  let mejor: Date | null = null;
  for (const f of fechas) if (f && (!mejor || f.getTime() > mejor.getTime())) mejor = f;
  return mejor;
}

export const SaludNegocioDB = {
  /**
   * Señales de uso de UN negocio. `desde7` / `desde30` = inicio de cada ventana.
   * No escribe nada ni toca la caché: el cron diario lo llama una vez por negocio.
   */
  async senalesDeUso(tenantId: string, desde7: Date, desde30: Date): Promise<SenalesDeUso> {
    const [actividad, ultimoIngreso, operaciones] = await Promise.all([
      prisma.$queryRawUnsafe<FilaActividad[]>(
        `SELECT
           (count(*) FILTER (WHERE action = 'login_success' AND "createdAt" >= $4))::int AS "ingresos7d",
           (count(*) FILTER (WHERE action = 'login_success'))::int AS "ingresos30d",
           (count(*) FILTER (WHERE action NOT LIKE 'login%' AND "createdAt" >= $4))::int AS "acciones7d",
           (count(*) FILTER (WHERE action NOT LIKE 'login%'))::int AS "acciones30d",
           (count(DISTINCT lower(entity)) FILTER (WHERE action NOT LIKE 'login%'))::int AS "modulos30d"
         FROM "ActivityLog"
         WHERE "tenantId" = $1 AND "createdAt" >= $5
           AND entity <> 'System' AND entity NOT LIKE '[L29733]%'
           AND NOT ("user" = ANY($2::text[]) OR "user" LIKE ANY($3::text[]))`,
        tenantId,
        [...USUARIOS_MAQUINA],
        [...PREFIJOS_MAQUINA],
        desde7,
        desde30,
      ),
      // Sin ventana: la última vez que una persona entró, aunque sea hace meses.
      // Índice (tenantId, createdAt) recorrido de lo nuevo a lo viejo: corta en el 1.º que cumple.
      prisma.$queryRawUnsafe<Array<{ createdAt: Date }>>(
        `SELECT "createdAt" FROM "ActivityLog"
         WHERE "tenantId" = $1 AND action = 'login_success'
           AND entity <> 'System' AND entity NOT LIKE '[L29733]%'
           AND NOT ("user" = ANY($2::text[]) OR "user" LIKE ANY($3::text[]))
         ORDER BY "createdAt" DESC LIMIT 1`,
        tenantId,
        [...USUARIOS_MAQUINA],
        [...PREFIJOS_MAQUINA],
      ),
      prisma.$queryRawUnsafe<FilaOperaciones[]>(
        `SELECT
           (SELECT count(*) FROM "Order" WHERE "tenantId" = $1 AND "createdAt" >= $2)::int AS "pedidos7d",
           (SELECT count(*) FROM "Order" WHERE "tenantId" = $1 AND "createdAt" >= $3)::int AS "pedidos30d",
           (SELECT max("createdAt") FROM "Order" WHERE "tenantId" = $1) AS "pedidosUlt",
           (SELECT count(*) FROM "Sale" WHERE "tenantId" = $1 AND "createdAt" >= $2)::int AS "ventas7d",
           (SELECT count(*) FROM "Sale" WHERE "tenantId" = $1 AND "createdAt" >= $3)::int AS "ventas30d",
           (SELECT max("createdAt") FROM "Sale" WHERE "tenantId" = $1) AS "ventasUlt",
           (SELECT count(*) FROM "ForestCtpEntry" WHERE "tenantId" = $1 AND "createdAt" >= $2)::int AS "libro7d",
           (SELECT count(*) FROM "ForestCtpEntry" WHERE "tenantId" = $1 AND "createdAt" >= $3)::int AS "libro30d",
           (SELECT max("createdAt") FROM "ForestCtpEntry" WHERE "tenantId" = $1) AS "libroUlt",
           (SELECT count(*) FROM "WoodEntry" WHERE "tenantId" = $1 AND "createdAt" >= $2)::int AS "trozas7d",
           (SELECT count(*) FROM "WoodEntry" WHERE "tenantId" = $1 AND "createdAt" >= $3)::int AS "trozas30d",
           (SELECT max("createdAt") FROM "WoodEntry" WHERE "tenantId" = $1) AS "trozasUlt"`,
        tenantId,
        desde7,
        desde30,
      ),
    ]);

    const a = actividad[0];
    const o = operaciones[0];
    const fecha = (v: Date | null | undefined): Date | null => (v ? new Date(v) : null);

    return {
      ingresos7d: num(a?.ingresos7d),
      ingresos30d: num(a?.ingresos30d),
      ultimoIngreso: fecha(ultimoIngreso[0]?.createdAt),
      acciones7d: num(a?.acciones7d),
      acciones30d: num(a?.acciones30d),
      modulos30d: num(a?.modulos30d),
      operaciones7d: num(o?.pedidos7d) + num(o?.ventas7d) + num(o?.libro7d) + num(o?.trozas7d),
      operaciones30d: num(o?.pedidos30d) + num(o?.ventas30d) + num(o?.libro30d) + num(o?.trozas30d),
      ultimaOperacion: masReciente([
        fecha(o?.pedidosUlt), fecha(o?.ventasUlt), fecha(o?.libroUlt), fecha(o?.trozasUlt),
      ]),
      desglose30d: {
        pedidos: num(o?.pedidos30d),
        ventas: num(o?.ventas30d),
        libroCtp: num(o?.libro30d),
        trozas: num(o?.trozas30d),
      },
    };
  },
};
