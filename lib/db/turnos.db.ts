import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DbTurno = {
  id: string;
  tenantId: string;
  adminUserId: string;
  cashRegisterId?: string;
  inicioEfectivo: number;
  cierreEfectivo?: number;
  ventasTotal: number;
  status: "ABIERTO" | "CERRADO";
  abrioEn: string;
  cerroEn?: string;
  notas?: string;
  createdAt: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function toISO(d: Date): string {
  return d.toISOString();
}

function toNum(d: Prisma.Decimal | null | undefined): number {
  return d ? Number(d) : 0;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapTurno(t: any): DbTurno {
  return {
    id: t.id,
    tenantId: t.tenantId,
    adminUserId: t.adminUserId,
    ...(t.cashRegisterId != null && { cashRegisterId: t.cashRegisterId }),
    inicioEfectivo: toNum(t.inicioEfectivo),
    ...(t.cierreEfectivo != null && { cierreEfectivo: toNum(t.cierreEfectivo) }),
    ventasTotal: toNum(t.ventasTotal),
    status: t.status,
    abrioEn: toISO(t.abrioEn),
    ...(t.cerroEn != null && { cerroEn: toISO(t.cerroEn) }),
    ...(t.notas != null && { notas: t.notas }),
    createdAt: toISO(t.createdAt),
  };
}

// ── Turnos DB ─────────────────────────────────────────────────────────────────

export const TurnosDB = {
  /**
   * Devuelve el turno activo del cajero. Opcionalmente filtra tambien por
   * cashRegisterId para multi-caja (T5): un cajero puede tener turno en
   * register A y otro en register B sin colision.
   */
  async getActivo(
    tenantId: string,
    adminUserId: string,
    cashRegisterId?: string,
  ): Promise<DbTurno | null> {
    const row = await prisma.turno.findFirst({
      where: {
        tenantId,
        adminUserId,
        status: "ABIERTO",
        ...(cashRegisterId !== undefined && { cashRegisterId }),
      },
      orderBy: { abrioEn: "desc" },
    });
    return row ? mapTurno(row) : null;
  },

  async abrir(data: {
    tenantId: string;
    adminUserId: string;
    cashRegisterId?: string;
    inicioEfectivo: number;
    notas?: string;
  }): Promise<DbTurno> {
    const row = await prisma.turno.create({
      data: {
        tenantId: data.tenantId,
        adminUserId: data.adminUserId,
        cashRegisterId: data.cashRegisterId ?? null,
        inicioEfectivo: data.inicioEfectivo,
        notas: data.notas,
      },
    });
    return mapTurno(row);
  },

  /**
   * Cierra un turno con optimistic lock — si dos requests llegan en paralelo,
   * solo el primero gana (count === 1). El segundo recibe count === 0 y la
   * funcion devuelve `null` para que el caller responda 409/422.
   *
   * Nota: el aggregate de ventas para `ventasTotal` lo calcula el caller
   * antes de invocar este metodo (necesita scope por cashierId del turno).
   * Si el caller falla a mitad, no hay cambios en el turno (atomic).
   */
  async cerrar(
    turnoId: string,
    tenantId: string,
    data: { cierreEfectivo: number; ventasTotal: number; notas?: string }
  ): Promise<DbTurno | null> {
    // Optimistic lock: solo cierra si sigue ABIERTO. Si esta CERRADO o
    // alguien ya lo cerro, count === 0 y devolvemos null.
    return prisma.$transaction(async (tx) => {
      const result = await tx.turno.updateMany({
        where: {
          id: turnoId,
          tenantId,
          status: "ABIERTO",
        },
        data: {
          cierreEfectivo: data.cierreEfectivo,
          ventasTotal: data.ventasTotal,
          status: "CERRADO",
          cerroEn: new Date(),
          ...(data.notas !== undefined && { notas: data.notas }),
        },
      });

      if (result.count === 0) return null;

      const row = await tx.turno.findUnique({ where: { id: turnoId } });
      return row ? mapTurno(row) : null;
    });
  },

  async list(
    tenantId: string,
    filters?: { status?: string; adminUserId?: string }
  ): Promise<DbTurno[]> {
    const where: Record<string, unknown> = { tenantId };
    if (filters?.status) where.status = filters.status;
    if (filters?.adminUserId) where.adminUserId = filters.adminUserId;

    const rows = await prisma.turno.findMany({
      where,
      orderBy: { abrioEn: "desc" },
    });
    return rows.map(mapTurno);
  },
};
