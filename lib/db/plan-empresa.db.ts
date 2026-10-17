import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import {
  leerSeccion,
  vacia,
  type DatosSeccion,
  type SeccionGuardada,
  type SeccionPlan,
  type VersionSeccion,
} from "@/lib/planificacion/secciones";

/**
 * PlanEmpresaDB — el plan de la empresa, una fila por sección (ADR-497).
 *
 * `tenantId` SIEMPRE 1er parámetro. Cada sección es un documento JSON que se
 * guarda entero con concurrencia optimista: se escribe sólo si la `version`
 * guardada sigue siendo la que el cliente editó (la condición va en el WHERE,
 * no en un `if` después). Cada guardado deja su copia en `PlanEmpresaVersion`
 * (las 30 más nuevas por sección) en la MISMA transacción.
 *
 * Lo leído pasa SIEMPRE por `leerSeccion`: un campo que no existía cuando se
 * guardó toma su default y un documento roto se lee vacío (nunca tira).
 *
 * Sin caché a propósito: se lee una vez al abrir la pestaña, y una copia vieja
 * en otra instancia haría que el próximo autoguardado choque (409 falso).
 *
 * Latencia (localhost→Supabase ~119 ms por ida): guardar = 3 idas dentro de la
 * transacción (+1 para podar a partir de la versión 31).
 */

/** Cuántas versiones se guardan por sección (las más nuevas). */
export const MAX_VERSIONES_PLAN = 30;

/** Por el pooler, abrir la transacción desde localhost puede pasar los 2 s de `maxWait` por defecto. */
const TX_OPTS = { maxWait: 10_000, timeout: 20_000 } as const;

const SELECT_SECCION = {
  seccion: true,
  datos: true,
  version: true,
  updatedAt: true,
  updatedBy: true,
} satisfies Prisma.PlanEmpresaSeccionSelect;

type FilaSeccion = Prisma.PlanEmpresaSeccionGetPayload<{ select: typeof SELECT_SECCION }>;
type Mapa = Partial<{ [S in SeccionPlan]: SeccionGuardada<S> }>;

export type ResultadoGuardarPlan<S extends SeccionPlan = SeccionPlan> =
  | { ok: true; guardada: SeccionGuardada<S> }
  | { ok: false; motivo: "cambio_en_paralelo"; actual: SeccionGuardada<S> };

export type ResultadoRestaurarPlan<S extends SeccionPlan = SeccionPlan> =
  | ResultadoGuardarPlan<S>
  | { ok: false; motivo: "no_existe" };

function aGuardada<S extends SeccionPlan>(seccion: S, fila: FilaSeccion | null): SeccionGuardada<S> {
  if (!fila) return { datos: vacia(seccion), version: 0, actualizado: null, autor: null };
  return {
    datos: leerSeccion(seccion, fila.datos),
    version: fila.version,
    actualizado: fila.updatedAt.toISOString(),
    autor: fila.updatedBy,
  };
}

/**
 * La escritura con versión, dentro de una transacción abierta.
 * - `versionEditada = 0`: la sección no existía para el cliente → INSERT … ON CONFLICT DO NOTHING.
 * - si no: UPDATE … WHERE version = versionEditada. Dos guardados a la vez: el
 *   segundo espera el candado de la fila, re-evalúa el WHERE y cuenta 0.
 * Cuenta 0 → conflicto con lo que hay ahora; no se escribe nada.
 */
async function escribir<S extends SeccionPlan>(
  tx: Prisma.TransactionClient,
  tenantId: string,
  seccion: S,
  datos: DatosSeccion<S>,
  versionEditada: number,
  autor: string,
): Promise<ResultadoGuardarPlan<S>> {
  const nueva = versionEditada + 1;
  const ahora = new Date();
  const json = datos as Prisma.InputJsonValue;

  const { count } =
    versionEditada === 0
      ? await tx.planEmpresaSeccion.createMany({
          data: [{ tenantId, seccion, datos: json, version: 1, updatedBy: autor, createdAt: ahora, updatedAt: ahora }],
          skipDuplicates: true,
        })
      : await tx.planEmpresaSeccion.updateMany({
          where: { tenantId, seccion, version: versionEditada },
          data: { datos: json, version: nueva, updatedBy: autor, updatedAt: ahora },
        });

  if (count === 0) {
    const fila = await tx.planEmpresaSeccion.findUnique({
      where: { tenantId_seccion: { tenantId, seccion } },
      select: SELECT_SECCION,
    });
    return { ok: false, motivo: "cambio_en_paralelo", actual: aGuardada(seccion, fila) };
  }

  await tx.planEmpresaVersion.createMany({ data: [{ tenantId, seccion, version: nueva, datos: json, autor, createdAt: ahora }] });
  // Las versiones de una sección son correlativas: quedarse con las 30 más nuevas = borrar las ≤ nueva − 30.
  if (nueva > MAX_VERSIONES_PLAN) {
    await tx.planEmpresaVersion.deleteMany({ where: { tenantId, seccion, version: { lte: nueva - MAX_VERSIONES_PLAN } } });
  }
  return { ok: true, guardada: { datos, version: nueva, actualizado: ahora.toISOString(), autor } };
}

export const PlanEmpresaDB = {
  /** Todas las pedidas; las nunca guardadas vienen con `version: 0` y `vacia(s)`. */
  async leer(tenantId: string, secciones: readonly SeccionPlan[]): Promise<Mapa> {
    if (!tenantId) throw new Error("tenantId is required");
    if (secciones.length === 0) return {};
    const filas = await prisma.planEmpresaSeccion.findMany({
      where: { tenantId, seccion: { in: [...secciones] } },
      select: SELECT_SECCION,
    });
    const porSeccion = new Map(filas.map((f) => [f.seccion, f]));
    const mapa: Record<string, SeccionGuardada> = {};
    for (const s of secciones) mapa[s] = aGuardada(s, porSeccion.get(s) ?? null);
    return mapa as Mapa;
  },

  /** `datos` ya validado por `SCHEMAS_SECCION[seccion]` (la ruta lo hace con `safeParse`). */
  async guardar<S extends SeccionPlan>(
    tenantId: string,
    seccion: S,
    datos: DatosSeccion<S>,
    versionEditada: number,
    autor: string,
  ): Promise<ResultadoGuardarPlan<S>> {
    if (!tenantId) throw new Error("tenantId is required");
    return prisma.$transaction((tx) => escribir(tx, tenantId, seccion, datos, versionEditada, autor), TX_OPTS);
  },

  /** Las versiones guardadas, la más nueva primero (máx 30). */
  async historial(tenantId: string, seccion: SeccionPlan): Promise<VersionSeccion[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const filas = await prisma.planEmpresaVersion.findMany({
      where: { tenantId, seccion },
      orderBy: { version: "desc" },
      take: MAX_VERSIONES_PLAN,
      select: { version: true, autor: true, createdAt: true },
    });
    return filas.map((f) => ({ version: f.version, autor: f.autor, creado: f.createdAt.toISOString() }));
  },

  /**
   * Copia `version` como una versión nueva (la de ahora + 1): lo de ahora queda
   * en el historial y se puede volver. Lee la versión y la de ahora y escribe en
   * la misma transacción: si otro guardó en el medio, conflicto.
   */
  async restaurar<S extends SeccionPlan>(
    tenantId: string,
    seccion: S,
    version: number,
    autor: string,
  ): Promise<ResultadoRestaurarPlan<S>> {
    if (!tenantId) throw new Error("tenantId is required");
    return prisma.$transaction(async (tx): Promise<ResultadoRestaurarPlan<S>> => {
      const copia = await tx.planEmpresaVersion.findUnique({
        where: { tenantId_seccion_version: { tenantId, seccion, version } },
        select: { datos: true },
      });
      if (!copia) return { ok: false, motivo: "no_existe" };
      const ahora = await tx.planEmpresaSeccion.findUnique({
        where: { tenantId_seccion: { tenantId, seccion } },
        select: { version: true },
      });
      return escribir(tx, tenantId, seccion, leerSeccion(seccion, copia.datos), ahora?.version ?? 0, autor);
    }, TX_OPTS);
  },

  /**
   * Para el cron de avisos (`planificacion-avisos`): ENTRE NEGOCIOS a
   * propósito, por eso no lleva `tenantId` (como `ContractsDB.listPendingExpiryReminders`).
   * Una sola consulta para todos; sólo los negocios con alguna de estas
   * secciones guardadas (el resto no tiene plan y no se le avisa nada).
   * Cada sección pasa por `leerSeccion`, igual que al abrir la pestaña.
   */
  async seccionesDeTodos<S extends SeccionPlan>(
    secciones: readonly S[],
  ): Promise<Map<string, Partial<{ [K in S]: DatosSeccion<K> }>>> {
    type Plan = Partial<{ [K in S]: DatosSeccion<K> }>;
    const porTenant = new Map<string, Plan>();
    if (secciones.length === 0) return porTenant;
    const filas = await prisma.planEmpresaSeccion.findMany({
      where: { seccion: { in: [...secciones] } },
      select: { tenantId: true, seccion: true, datos: true },
    });
    for (const f of filas) {
      const s = f.seccion as S;
      if (!secciones.includes(s)) continue;
      const plan: Plan = porTenant.get(f.tenantId) ?? {};
      plan[s] = leerSeccion(s, f.datos) as Plan[S];
      porTenant.set(f.tenantId, plan);
    }
    return porTenant;
  },
};
