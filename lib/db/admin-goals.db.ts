import "server-only";
import { prisma } from "@/lib/prisma";
import type { AdminGoal, Prisma } from "@/lib/generated/prisma/client";
import { invalidateByPrefix } from "@/lib/cache";
import { normalizarUnidad, unidadPermitida } from "@/lib/admin/metas-catalogo";
import { prefijoCacheAvance } from "@/lib/metas/avance/tipos";
import {
  dateAFecha,
  fechaADate,
  type CategoriaMeta,
  type MetaCrear,
  type MetaDTO,
  type MetaEditar,
  type PeriodoMeta,
} from "@/lib/admin/metas-tareas";

/**
 * AdminGoalsDB — metas del panel, una lista por negocio (ADR-415).
 *
 * Antes vivían en `local-data/goals.json`, compartidas por todos los negocios.
 * `tenantId` SIEMPRE 1er parámetro. Editar y borrar filtran por (tenantId, id)
 * en la misma sentencia: el id de una meta de otro negocio no existe para este.
 *
 * ADR-488: el avance se deriva de los datos al leer (`lib/metas/avance`), así
 * que `current` sólo se guarda en la categoría `manual`; en las demás queda en
 * 0 aunque el cliente mande otra cosa. La unidad la fija el catálogo
 * (`normalizarUnidad`): una meta de cubicación no puede quedar en «S/».
 */

function aDTO(row: AdminGoal): MetaDTO {
  return {
    id: row.id,
    name: row.name,
    category: row.category as CategoriaMeta,
    period: row.period as PeriodoMeta,
    // Un Decimal serializado es string, y "50000" >= "9000" da false en la pantalla.
    target: Number(row.target),
    current: Number(row.current),
    unit: row.unit,
    createdAt: row.createdAt.toISOString(),
    ...(row.dueDate ? { dueDate: dateAFecha(row.dueDate) } : {}),
  };
}

/** Por qué no se guardó un cambio: la ruta lo traduce a 404, 409 o 422. */
export type MotivoMetaNoEditada = "no_existe" | "avance_solo_manual" | "unidad_no_valida" | "cambio_en_paralelo";
export type ResultadoEditarMeta = { ok: true; meta: MetaDTO } | { ok: false; motivo: MotivoMetaNoEditada };

const esManual = (category: CategoriaMeta) => category === "manual";

/** Tras cualquier escritura: el avance cacheado del negocio se vuelve a leer. */
const olvidarAvance = (tenantId: string) => invalidateByPrefix(prefijoCacheAvance(tenantId));

export const AdminGoalsDB = {
  /** En el orden en que se crearon, como cuando vivían en el JSON. */
  async listar(tenantId: string): Promise<MetaDTO[]> {
    const rows = await prisma.adminGoal.findMany({ where: { tenantId }, orderBy: { createdAt: "asc" } });
    return rows.map(aDTO);
  },

  async crear(tenantId: string, datos: MetaCrear, creadoPor: string): Promise<MetaDTO> {
    const row = await prisma.adminGoal.create({
      data: {
        tenantId,
        createdBy: creadoPor,
        name: datos.name,
        category: datos.category,
        period: datos.period,
        target: datos.target,
        current: esManual(datos.category) ? datos.current : 0,
        unit: normalizarUnidad(datos.category, datos.unit),
        dueDate: datos.dueDate ? fechaADate(datos.dueDate) : null,
      },
    });
    olvidarAvance(tenantId);
    return aDTO(row);
  },

  /**
   * Sólo cambia los campos que llegan. Las reglas de ADR-488 van en el WHERE
   * (no en un `if` después): el avance se anota sólo si la meta ES `manual` al
   * escribir, y la unidad se midió contra la categoría que se leyó, así que si
   * otro la cambió en el medio no se escribe nada.
   */
  async editar(tenantId: string, id: string, datos: MetaEditar): Promise<ResultadoEditarMeta> {
    const data: Prisma.AdminGoalUpdateManyMutationInput = {};
    if (datos.name !== undefined) data.name = datos.name;
    if (datos.period !== undefined) data.period = datos.period;
    if (datos.target !== undefined) data.target = datos.target;
    if (datos.dueDate !== undefined) data.dueDate = datos.dueDate ? fechaADate(datos.dueDate) : null;
    const where: Prisma.AdminGoalWhereInput = { tenantId, id };
    let siNoEscribe: MotivoMetaNoEditada = "no_existe";

    if (datos.category !== undefined || datos.unit !== undefined) {
      // La unidad se mide contra la categoría con que QUEDA la meta: hace falta la guardada.
      const guardada = await prisma.adminGoal.findFirst({ where: { tenantId, id }, select: { category: true, unit: true } });
      if (!guardada) return { ok: false, motivo: "no_existe" };
      const antes = guardada.category as CategoriaMeta;
      const queda = datos.category ?? antes;
      if (datos.unit !== undefined && !unidadPermitida(queda, datos.unit)) return { ok: false, motivo: "unidad_no_valida" };
      if (!esManual(queda) && (datos.current ?? 0) > 0) return { ok: false, motivo: "avance_solo_manual" };
      if (datos.category !== undefined) data.category = datos.category;
      const unidad = normalizarUnidad(queda, datos.unit ?? guardada.unit);
      if (unidad !== guardada.unit) data.unit = unidad;
      // Fuera de `manual` el avance guardado es siempre 0 (también al dejar de ser a mano).
      if (!esManual(queda)) data.current = 0;
      else if (datos.current !== undefined) data.current = datos.current;
      where.category = antes;
      siNoEscribe = "cambio_en_paralelo";
    } else if (datos.current !== undefined) {
      data.current = datos.current;
      if (datos.current > 0) {
        where.category = "manual";
        siNoEscribe = "avance_solo_manual";
      }
    }

    if (Object.keys(data).length > 0) {
      const { count } = await prisma.adminGoal.updateMany({ where, data });
      if (count === 0) {
        if (siNoEscribe === "no_existe") return { ok: false, motivo: "no_existe" };
        // Cero filas: o la meta no es de este negocio, o no cumplía la condición del WHERE.
        const existe = await prisma.adminGoal.findFirst({ where: { tenantId, id }, select: { id: true } });
        return { ok: false, motivo: existe ? siNoEscribe : "no_existe" };
      }
      olvidarAvance(tenantId);
    }
    const row = await prisma.adminGoal.findFirst({ where: { tenantId, id } });
    return row ? { ok: true, meta: aDTO(row) } : { ok: false, motivo: "no_existe" };
  },

  /** `false` si no había nada que borrar en este negocio. */
  async borrar(tenantId: string, id: string): Promise<boolean> {
    const { count } = await prisma.adminGoal.deleteMany({ where: { tenantId, id } });
    if (count > 0) olvidarAvance(tenantId);
    return count > 0;
  },
};
