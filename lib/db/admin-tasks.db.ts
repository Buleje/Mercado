import "server-only";
import { prisma } from "@/lib/prisma";
import type { AdminTask, Prisma } from "@/lib/generated/prisma/client";
import {
  dateAFecha,
  fechaADate,
  opcionalParaGuardar,
  type EstadoTarea,
  type PrioridadTarea,
  type TareaCrear,
  type TareaDTO,
  type TareaEditar,
} from "@/lib/admin/metas-tareas";

/**
 * AdminTasksDB — tareas del equipo, una lista por negocio (ADR-415).
 *
 * Antes vivían en `local-data/tasks.json`, compartidas por todos los negocios.
 * `tenantId` SIEMPRE 1er parámetro. `completedAt` lo decide esta clase al
 * cambiar el estado (el CHECK de la tabla exige que vaya junto con
 * `status = 'completada'`), nunca el cliente.
 */

function aDTO(row: AdminTask): TareaDTO {
  return {
    id: row.id,
    title: row.title,
    ...(row.description ? { description: row.description } : {}),
    priority: row.priority as PrioridadTarea,
    status: row.status as EstadoTarea,
    ...(row.assignedTo ? { assignedTo: row.assignedTo } : {}),
    ...(row.dueDate ? { dueDate: dateAFecha(row.dueDate) } : {}),
    ...(row.module ? { module: row.module } : {}),
    createdAt: row.createdAt.toISOString(),
    ...(row.completedAt ? { completedAt: row.completedAt.toISOString() } : {}),
  };
}

const esNoEncontrado = (err: unknown): boolean =>
  typeof err === "object" && err !== null && (err as { code?: string }).code === "P2025";

export const AdminTasksDB = {
  /** Las más nuevas primero, como ordenaba la ruta cuando vivían en el JSON. */
  async listar(tenantId: string): Promise<TareaDTO[]> {
    const rows = await prisma.adminTask.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" } });
    return rows.map(aDTO);
  },

  async crear(tenantId: string, datos: TareaCrear, creadoPor: string): Promise<TareaDTO> {
    const row = await prisma.adminTask.create({
      data: {
        tenantId,
        createdBy: creadoPor,
        title: datos.title,
        description: opcionalParaGuardar(datos.description) ?? null,
        priority: datos.priority,
        status: "pendiente",
        assignedTo: opcionalParaGuardar(datos.assignedTo) ?? null,
        module: opcionalParaGuardar(datos.module) ?? null,
        dueDate: datos.dueDate ? fechaADate(datos.dueDate) : null,
      },
    });
    return aDTO(row);
  },

  /** `null` si la tarea no existe en este negocio. Sólo cambia los campos que llegan. */
  async editar(tenantId: string, id: string, datos: TareaEditar): Promise<TareaDTO | null> {
    const data: Prisma.AdminTaskUpdateInput = {};
    if (datos.title !== undefined) data.title = datos.title;
    if (datos.description !== undefined) data.description = opcionalParaGuardar(datos.description) ?? null;
    if (datos.priority !== undefined) data.priority = datos.priority;
    if (datos.assignedTo !== undefined) data.assignedTo = opcionalParaGuardar(datos.assignedTo) ?? null;
    if (datos.module !== undefined) data.module = opcionalParaGuardar(datos.module) ?? null;
    if (datos.dueDate !== undefined) data.dueDate = datos.dueDate ? fechaADate(datos.dueDate) : null;
    if (datos.status !== undefined) {
      data.status = datos.status;
      data.completedAt = datos.status === "completada" ? new Date() : null;
    }
    try {
      const row = await prisma.adminTask.update({ where: { tenantId_id: { tenantId, id } }, data });
      return aDTO(row);
    } catch (err) {
      if (esNoEncontrado(err)) return null;
      throw err;
    }
  },

  /** `false` si no había nada que borrar en este negocio. */
  async borrar(tenantId: string, id: string): Promise<boolean> {
    const { count } = await prisma.adminTask.deleteMany({ where: { tenantId, id } });
    return count > 0;
  },
};
