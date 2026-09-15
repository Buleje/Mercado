import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { logActivity } from "@/lib/activity-logger";
import type { PuestoInput } from "@/lib/rrhh/schemas";
import type { PuestoRow as DtoPuestoRow } from "@/lib/rrhh/dto";

/**
 * PuestosDB — el catálogo de puestos de trabajo del tenant (ADR-414 §2).
 *
 * La tarifa que guarda un puesto es SUGERIDA: sólo prellena la de la persona
 * al darla de alta (`ColaboradoresDB.crear`) y nunca entra al cálculo de lo
 * ganado — cambiarla acá no le toca el sueldo a nadie.
 *
 * `tenantId` SIEMPRE 1er parámetro. Prisma sólo se usa acá.
 */

export class NombreDePuestoDuplicadoError extends Error {
  constructor(public readonly existente: { id: string; nombre: string }) {
    super(`Ya existe un puesto llamado "${existente.nombre}".`);
    this.name = "NombreDePuestoDuplicadoError";
  }
}

/** El `PuestoRow` de `dto.ts` + cuántas personas no cesadas lo usan hoy. */
export interface PuestoRow extends DtoPuestoRow {
  personas: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}

const toNum = (d: Prisma.Decimal | number | null | undefined): number => (d == null ? 0 : Number(d));

type PuestoPrismaRow = {
  id: string;
  nombre: string;
  descripcion: string | null;
  tarifaModalidad: string | null;
  tarifaMonto: Prisma.Decimal | null;
  horasJornada: Prisma.Decimal;
  horaEntrada: string | null;
  toleranciaMin: number;
  orden: number;
};

function mapPuesto(row: PuestoPrismaRow, personas: number): PuestoRow {
  return {
    id: row.id,
    nombre: row.nombre,
    descripcion: row.descripcion,
    tarifaModalidad: row.tarifaModalidad,
    tarifaMonto: row.tarifaMonto == null ? null : toNum(row.tarifaMonto),
    horasJornada: toNum(row.horasJornada),
    horaEntrada: row.horaEntrada,
    toleranciaMin: row.toleranciaMin,
    orden: row.orden,
    personas,
  };
}

/** Personas no cesadas, ni eliminadas, con este puesto — lo que bloquea `eliminar`. */
async function contarPersonas(tenantId: string, puestoId: string): Promise<number> {
  return prisma.colaborador.count({
    where: { tenantId, puestoId, deletedAt: null, estado: { not: "CESADO" } },
  });
}

// ── API ──────────────────────────────────────────────────────────────────────

export const PuestosDB = {
  async listar(tenantId: string): Promise<PuestoRow[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const [puestos, grupos] = await Promise.all([
      prisma.puesto.findMany({
        where: { tenantId, deletedAt: null },
        orderBy: [{ orden: "asc" }, { nombre: "asc" }],
      }),
      prisma.colaborador.groupBy({
        by: ["puestoId"],
        where: { tenantId, deletedAt: null, estado: { not: "CESADO" }, puestoId: { not: null } },
        _count: true,
      }),
    ]);
    const personasPorPuesto = new Map(grupos.map((g) => [g.puestoId as string, g._count]));
    return puestos.map((p) => mapPuesto(p, personasPorPuesto.get(p.id) ?? 0));
  },

  async crear(tenantId: string, input: PuestoInput, usuario: string): Promise<PuestoRow> {
    if (!tenantId) throw new Error("tenantId is required");
    const nombre = input.nombre.trim();
    // Lectura previa para un mensaje claro; el índice único parcial
    // `(tenantId, lower(btrim(nombre)))` de la migración es el árbitro real
    // contra la carrera de dos altas del mismo puesto a la vez.
    const existente = await prisma.puesto.findFirst({
      where: { tenantId, deletedAt: null, nombre: { equals: nombre, mode: "insensitive" } },
      select: { id: true, nombre: true },
    });
    if (existente) throw new NombreDePuestoDuplicadoError(existente);

    try {
      const row = await prisma.puesto.create({
        data: {
          tenantId,
          nombre,
          descripcion: input.descripcion?.trim() || null,
          tarifaModalidad: input.tarifaSugerida?.modalidad ?? null,
          tarifaMonto: input.tarifaSugerida ? new Prisma.Decimal(input.tarifaSugerida.monto) : null,
          horasJornada: input.horasJornada != null ? new Prisma.Decimal(input.horasJornada) : undefined,
          horaEntrada: input.horaEntrada ?? null,
          toleranciaMin: input.toleranciaMin ?? undefined,
          orden: input.orden ?? 0,
          createdBy: usuario,
        },
      });
      logActivity("rrhh_puesto_crear", "Puesto", `Creó el puesto "${nombre}"`, row.id, usuario, undefined, tenantId).catch(
        () => {},
      );
      return mapPuesto(row, 0);
    } catch (e) {
      if (isUniqueViolation(e)) throw new NombreDePuestoDuplicadoError({ id: "", nombre });
      throw e;
    }
  },

  async actualizar(
    tenantId: string,
    id: string,
    patch: Partial<PuestoInput>,
    usuario: string,
  ): Promise<PuestoRow | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const existing = await prisma.puesto.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!existing) return null;

    const data: Prisma.PuestoUpdateInput = {};
    const cambios: string[] = [];

    if (patch.nombre !== undefined) {
      const nombre = patch.nombre.trim();
      const dup = await prisma.puesto.findFirst({
        where: { tenantId, deletedAt: null, id: { not: id }, nombre: { equals: nombre, mode: "insensitive" } },
        select: { id: true, nombre: true },
      });
      if (dup) throw new NombreDePuestoDuplicadoError(dup);
      data.nombre = nombre;
      cambios.push("nombre");
    }
    if (patch.descripcion !== undefined) {
      data.descripcion = patch.descripcion?.trim() || null;
      cambios.push("descripción");
    }
    if (patch.tarifaSugerida !== undefined) {
      data.tarifaModalidad = patch.tarifaSugerida?.modalidad ?? null;
      data.tarifaMonto = patch.tarifaSugerida ? new Prisma.Decimal(patch.tarifaSugerida.monto) : null;
      cambios.push("tarifa sugerida");
    }
    if (patch.horasJornada !== undefined) {
      data.horasJornada = new Prisma.Decimal(patch.horasJornada);
      cambios.push("horas de jornada");
    }
    if (patch.horaEntrada !== undefined) {
      data.horaEntrada = patch.horaEntrada;
      cambios.push("hora de entrada");
    }
    if (patch.toleranciaMin !== undefined) {
      data.toleranciaMin = patch.toleranciaMin;
      cambios.push("tolerancia");
    }
    if (patch.orden !== undefined) {
      data.orden = patch.orden;
    }

    try {
      const row = await prisma.puesto.update({ where: { id, tenantId }, data });
      if (cambios.length > 0) {
        logActivity(
          "rrhh_puesto_editar",
          "Puesto",
          `Cambió: ${cambios.join(", ")}`,
          id,
          usuario,
          undefined,
          tenantId,
        ).catch(() => {});
      }
      const personas = await contarPersonas(tenantId, id);
      return mapPuesto(row, personas);
    } catch (e) {
      if (isUniqueViolation(e)) throw new NombreDePuestoDuplicadoError({ id, nombre: patch.nombre ?? existing.nombre });
      throw e;
    }
  },

  async eliminar(
    tenantId: string,
    id: string,
    usuario: string,
  ): Promise<{ ok: true } | { ok: false; enUso: number } | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const existing = await prisma.puesto.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!existing) return null;

    const enUso = await contarPersonas(tenantId, id);
    if (enUso > 0) return { ok: false, enUso };

    await prisma.puesto.update({ where: { id, tenantId }, data: { deletedAt: new Date() } });
    logActivity("rrhh_puesto_eliminar", "Puesto", `Eliminó el puesto "${existing.nombre}"`, id, usuario, undefined, tenantId).catch(
      () => {},
    );
    return { ok: true };
  },
};
