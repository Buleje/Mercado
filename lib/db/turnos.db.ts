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

/** Fila del historial: el turno + lo que la pantalla no debe calcular por su cuenta. */
export type DbTurnoHistorial = DbTurno & {
  cajeroNombre: string;
  /** Efectivo que debía haber en el cajón (caja cerrada con el turno); null = sin dato. */
  esperado: number | null;
  /** Contado − esperado, calculado por el servidor al cerrar; null = sin dato. */
  diferencia: number | null;
  /** Lo cerró el cron de turnos olvidados (>12 h) sin conteo: hay que revisar el arqueo. */
  cerradoPorSistema: boolean;
};

/** La caja vinculada cuenta como «cerrada con el turno» si cerró a ±2 min de él. */
const MARGEN_CIERRE_CAJA_MS = 2 * 60_000;
/** Nota que deja `app/api/cron/turnos-zombie-close` («Cerrado automaticamente (zombie >12h)…»). */
const CERRADO_POR_SISTEMA = /^Cerrado autom[aá]ticamente/i;

/**
 * Esperado y diferencia de la caja de un turno: sólo si la caja se cerró CON el
 * turno y la cerró una persona contando. El cron de turnos olvidados cierra la
 * caja con «inicio + ventas» (Yape incluido), así que esa diferencia es
 * inventada: un turno cerrado por el sistema queda sin dato (null).
 */
export function cifrasDeCajaDelTurno(
  turno: { cerroEn: Date | null; notas: string | null },
  caja: { closedAt: Date | null; expectedAmount: Prisma.Decimal | number | null; difference: Prisma.Decimal | number | null } | undefined,
): { esperado: number | null; diferencia: number | null; cerradoPorSistema: boolean } {
  const cerradoPorSistema = CERRADO_POR_SISTEMA.test(turno.notas ?? "");
  const cerroConElTurno = !cerradoPorSistema && !!caja?.closedAt && !!turno.cerroEn
    && Math.abs(caja.closedAt.getTime() - turno.cerroEn.getTime()) <= MARGEN_CIERRE_CAJA_MS;
  return {
    esperado: cerroConElTurno && caja?.expectedAmount != null ? Number(caja.expectedAmount) : null,
    diferencia: cerroConElTurno && caja?.difference != null ? Number(caja.difference) : null,
    cerradoPorSistema,
  };
}

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
   * ¿El usuario tuvo (o tiene) un turno en esa caja? Es lo que habilita a una
   * cajera a ver el parte de una caja ya cerrada: la suya sí, la de otro no.
   */
  async tieneTurnoEnCaja(tenantId: string, adminUserId: string, cashRegisterId: string): Promise<boolean> {
    if (!tenantId) throw new Error("[TurnosDB.tieneTurnoEnCaja] tenantId required");
    const row = await prisma.turno.findFirst({
      where: { tenantId, adminUserId, cashRegisterId },
      select: { id: true },
    });
    return row !== null;
  },

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
    /** `cierreEfectivo: null` = nadie contó y no hay caja de donde sacar el esperado (cron sin caja abierta). */
    data: { cierreEfectivo: number | null; ventasTotal: number; notas?: string }
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

  /**
   * El historial que dibuja la pestaña Turnos: cada turno con el NOMBRE de quien
   * atendió y la diferencia de caja que calculó el servidor al cerrar.
   *
   * La pantalla restaba `cierre − inicio − ventasTotal`, pero `ventasTotal` suma
   * Yape y tarjeta, que nunca entran al cajón: el único turno de `main` salía
   * «+S/ 5.00» cuando la caja cerró en 0. La diferencia buena es la de la caja
   * que se cerró CON el turno (`CashRegister.difference`, apertura + ventas en
   * efectivo + ingresos − egresos). Sólo se toma si esa caja cerró en el mismo
   * minuto que el turno: dos turnos pueden compartir caja y el segundo no la
   * cierra. Sin caja vinculada → `null` (se muestra «—», no se inventa).
   */
  async listHistorial(
    tenantId: string,
    filters?: { status?: string; adminUserId?: string }
  ): Promise<DbTurnoHistorial[]> {
    const where: Record<string, unknown> = { tenantId };
    if (filters?.status) where.status = filters.status;
    if (filters?.adminUserId) where.adminUserId = filters.adminUserId;

    // Tope: el historial es una pantalla, no un export (sin él traía todos los
    // turnos del negocio con su caja en cada carga).
    const rows = await prisma.turno.findMany({
      where,
      orderBy: { abrioEn: "desc" },
      include: { adminUser: { select: { name: true, username: true } } },
      take: 500,
    });
    const idsCaja = [...new Set(rows.map((r) => r.cashRegisterId).filter((v): v is string => !!v))];
    const cajas = idsCaja.length > 0
      ? await prisma.cashRegister.findMany({
          where: { tenantId, id: { in: idsCaja } },
          select: { id: true, expectedAmount: true, difference: true, closedAt: true },
        })
      : [];
    const cajaPorId = new Map(cajas.map((c) => [c.id, c]));

    return rows.map((r) => {
      const caja = r.cashRegisterId ? cajaPorId.get(r.cashRegisterId) : undefined;
      return {
        ...mapTurno(r),
        cajeroNombre: r.adminUser?.name?.trim() || r.adminUser?.username || "—",
        ...cifrasDeCajaDelTurno(r, caja),
      };
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
