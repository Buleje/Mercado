import "server-only";
import { prisma } from "@/lib/prisma";
import { getOrSet, invalidateByPrefix } from "@/lib/cache";
import { toNumOrZero } from "@/lib/decimal-utils";

/**
 * DeclaracionesDB — tracker de declaraciones tributarias por tenant.
 * tenantId SIEMPRE 1er parámetro; sin fallback "main". Cache + invalidate.
 */

export type DeclaracionEstado = "pendiente" | "presentada" | "pagada";

export type DbDeclaracion = {
  id: string;
  periodo: string; // "YYYY-MM"
  tipo: string; // igv-renta | plame | renta-anual
  estado: DeclaracionEstado;
  montoDeclarado: number | null;
  fechaPresentacion: string | null;
  fechaPago: string | null;
  notas: string | null;
};

type PRow = {
  id: string;
  periodo: string;
  tipo: string;
  estado: string;
  montoDeclarado: unknown;
  fechaPresentacion: Date | null;
  fechaPago: Date | null;
  notas: string | null;
};

function mapRow(r: PRow): DbDeclaracion {
  return {
    id: r.id,
    periodo: r.periodo,
    tipo: r.tipo,
    estado: (["pendiente", "presentada", "pagada"].includes(r.estado) ? r.estado : "pendiente") as DeclaracionEstado,
    montoDeclarado: r.montoDeclarado != null ? toNumOrZero(r.montoDeclarado as Parameters<typeof toNumOrZero>[0]) : null,
    fechaPresentacion: r.fechaPresentacion ? r.fechaPresentacion.toISOString() : null,
    fechaPago: r.fechaPago ? r.fechaPago.toISOString() : null,
    notas: r.notas,
  };
}

export const DeclaracionesDB = {
  /** Declaraciones de un año (periodo "YYYY-..") para el tenant. */
  async listByYear(tenantId: string, year: string): Promise<DbDeclaracion[]> {
    return getOrSet(`declaraciones:${tenantId}:${year}`, 30, async () => {
      const rows = await prisma.declaracionTributaria.findMany({
        where: { tenantId, periodo: { startsWith: year } },
        orderBy: { periodo: "asc" },
      });
      return rows.map(mapRow);
    });
  },

  /** Crea o actualiza el estado de una declaración (único por tenant+periodo+tipo). */
  async upsertEstado(
    tenantId: string,
    input: {
      periodo: string;
      tipo: string;
      estado: DeclaracionEstado;
      montoDeclarado?: number | null;
      notas?: string | null;
    },
  ): Promise<DbDeclaracion> {
    // Fechas derivadas del estado: se sellan cuando corresponde.
    const now = new Date();
    const fechaPresentacion = input.estado === "presentada" || input.estado === "pagada" ? now : null;
    const fechaPago = input.estado === "pagada" ? now : null;

    const row = await prisma.declaracionTributaria.upsert({
      where: { tenantId_periodo_tipo: { tenantId, periodo: input.periodo, tipo: input.tipo } },
      create: {
        tenantId,
        periodo: input.periodo,
        tipo: input.tipo,
        estado: input.estado,
        montoDeclarado: input.montoDeclarado ?? null,
        fechaPresentacion,
        fechaPago,
        notas: input.notas ?? null,
      },
      update: {
        estado: input.estado,
        ...(input.montoDeclarado !== undefined && { montoDeclarado: input.montoDeclarado }),
        ...(input.notas !== undefined && { notas: input.notas }),
        // Solo setea fechas al avanzar; volver a "pendiente" las limpia.
        fechaPresentacion,
        fechaPago,
      },
    });
    invalidateByPrefix(`declaraciones:${tenantId}:`);
    return mapRow(row);
  },
};
