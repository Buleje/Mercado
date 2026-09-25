import "server-only";
import { prisma } from "@/lib/prisma";
import type { AdminGoal, Prisma } from "@/lib/generated/prisma/client";
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

const esNoEncontrado = (err: unknown): boolean =>
  typeof err === "object" && err !== null && (err as { code?: string }).code === "P2025";

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
        current: datos.current,
        unit: datos.unit,
        dueDate: datos.dueDate ? fechaADate(datos.dueDate) : null,
      },
    });
    return aDTO(row);
  },

  /** `null` si la meta no existe en este negocio. Sólo cambia los campos que llegan. */
  async editar(tenantId: string, id: string, datos: MetaEditar): Promise<MetaDTO | null> {
    const data: Prisma.AdminGoalUpdateInput = {};
    if (datos.name !== undefined) data.name = datos.name;
    if (datos.category !== undefined) data.category = datos.category;
    if (datos.period !== undefined) data.period = datos.period;
    if (datos.target !== undefined) data.target = datos.target;
    if (datos.current !== undefined) data.current = datos.current;
    if (datos.unit !== undefined) data.unit = datos.unit;
    if (datos.dueDate !== undefined) data.dueDate = datos.dueDate ? fechaADate(datos.dueDate) : null;
    try {
      const row = await prisma.adminGoal.update({ where: { tenantId_id: { tenantId, id } }, data });
      return aDTO(row);
    } catch (err) {
      if (esNoEncontrado(err)) return null;
      throw err;
    }
  },

  /** `false` si no había nada que borrar en este negocio. */
  async borrar(tenantId: string, id: string): Promise<boolean> {
    const { count } = await prisma.adminGoal.deleteMany({ where: { tenantId, id } });
    return count > 0;
  },
};
