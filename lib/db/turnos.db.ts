import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DbTurno = {
  id: string;
  tenantId: string;
  adminUserId: string;
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
  async getActivo(
    tenantId: string,
    adminUserId: string
  ): Promise<DbTurno | null> {
    const row = await prisma.turno.findFirst({
      where: { tenantId, adminUserId, status: "ABIERTO" },
      orderBy: { abrioEn: "desc" },
    });
    return row ? mapTurno(row) : null;
  },

  async abrir(data: {
    tenantId: string;
    adminUserId: string;
    inicioEfectivo: number;
    notas?: string;
  }): Promise<DbTurno> {
    const row = await prisma.turno.create({
      data: {
        tenantId: data.tenantId,
        adminUserId: data.adminUserId,
        inicioEfectivo: data.inicioEfectivo,
        notas: data.notas,
      },
    });
    return mapTurno(row);
  },

  async cerrar(
    turnoId: string,
    data: { cierreEfectivo: number; ventasTotal: number; notas?: string }
  ): Promise<DbTurno | null> {
    const row = await prisma.turno
      .update({
        where: { id: turnoId },
        data: {
          cierreEfectivo: data.cierreEfectivo,
          ventasTotal: data.ventasTotal,
          status: "CERRADO",
          cerroEn: new Date(),
          ...(data.notas !== undefined && { notas: data.notas }),
        },
      })
      .catch(() => null);
    return row ? mapTurno(row) : null;
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
